"use client";

import { useState, useCallback, useRef } from "react";
import { usePolling } from "./usePolling";

export type PipelineStage =
  | "idle"
  | "uploading"
  | "storyboard"
  | "storyboard-review"
  | "generating"
  | "upscaling"
  | "animating"
  | "music"
  | "montage"
  | "done"
  | "error";

export interface Shot {
  index: number;
  name: string;
  imagePrompt: string;
  motionPrompt: string;
  musicCue: string;
  imageUrl?: string;
  upscaleTaskId?: string;
  upscaledUrl?: string;
  animateTaskId?: string;
  videoUrl?: string;
}

export interface PipelineState {
  stage: PipelineStage;
  projectId: string | null;
  shots: Shot[];
  musicTaskId: string | null;
  musicUrl: string | null;
  finalVideoUrl: string | null;
  finalVideoBlob: Blob | null;
  error: string | null;
  progress: number; // 0-100
}

const INITIAL_STATE: PipelineState = {
  stage: "idle",
  projectId: null,
  shots: [],
  musicTaskId: null,
  musicUrl: null,
  finalVideoUrl: null,
  finalVideoBlob: null,
  error: null,
  progress: 0,
};

export function usePipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);
  const { startPolling, stopAll } = usePolling();
  const abortRef = useRef(false);

  const update = useCallback(
    (partial: Partial<PipelineState>) =>
      setState((prev) => ({ ...prev, ...partial })),
    []
  );

  // Save pipeline state to R2 after each stage completion
  const saveState = useCallback(async (currentState: PipelineState) => {
    if (!currentState.projectId) return;

    try {
      await fetch(`/api/project/${currentState.projectId}/save-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: currentState.stage,
          shots: currentState.shots,
          musicTaskId: currentState.musicTaskId,
          musicUrl: currentState.musicUrl,
          progress: currentState.progress,
        }),
      });
    } catch (err) {
      console.warn("Failed to save pipeline state:", err);
    }
  }, []);

  const updateShot = useCallback(
    (index: number, partial: Partial<Shot>) =>
      setState((prev) => ({
        ...prev,
        shots: prev.shots.map((s) =>
          s.index === index ? { ...s, ...partial } : s
        ),
      })),
    []
  );

  const reset = useCallback(() => {
    stopAll();
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, [stopAll]);

  const run = useCallback(
    async (theme: string, files: File[], numShots = 6, format = "16:9") => {
      abortRef.current = false;

      try {
        // 1. Upload refs
        update({ stage: "uploading", progress: 2 });
        const formData = new FormData();
        formData.append("theme", theme);
        formData.append("numShots", numShots.toString());
        formData.append("format", format);
        files.forEach((f) => formData.append("refs", f));

        const createRes = await fetch("/api/project/create", {
          method: "POST",
          body: formData,
        });
        const { projectId, refUrls } = await createRes.json();
        if (!projectId) throw new Error("Failed to create project");
        update({ projectId, progress: 5 });

        if (abortRef.current) return;

        // 2. Storyboard - Convert ref images to base64 for Claude vision
        update({ stage: "storyboard", progress: 8 });

        const refImages: { base64: string; mimeType: string }[] = [];
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const uint8 = new Uint8Array(bytes);
          // Chunked conversion to avoid "Maximum call stack size exceeded"
          let binary = "";
          const chunkSize = 8192;
          for (let offset = 0; offset < uint8.length; offset += chunkSize) {
            binary += String.fromCharCode(
              ...uint8.subarray(offset, offset + chunkSize)
            );
          }
          const base64 = btoa(binary);
          refImages.push({ base64, mimeType: file.type || "image/png" });
        }

        const sbRes = await fetch("/api/storyboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            theme,
            numShots,
            refImages, // Send images to Claude for vision analysis
          }),
        });
        const storyboard = await sbRes.json();
        if (storyboard.error) throw new Error(`Storyboard: ${storyboard.error}`);
        if (!storyboard.shots) throw new Error("Storyboard: no shots returned");

        const shots: Shot[] = storyboard.shots.map(
          (s: Shot, i: number) => ({
            ...s,
            index: i,
          })
        );

        // Move to storyboard-review stage (user can edit)
        update({ shots, stage: "storyboard-review", progress: 15 });

        // Save state after storyboard
        await saveState({
          ...state,
          projectId,
          stage: "storyboard-review",
          shots,
          progress: 15,
          musicTaskId: null,
          musicUrl: null,
          finalVideoUrl: null,
          finalVideoBlob: null,
          error: null,
        });

        // Pipeline will pause here until user confirms the storyboard
        return;

        // 3. Start music in parallel
        update({ stage: "generating" });
        const musicPromise = (async () => {
          const mRes = await fetch("/api/music/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: storyboard.musicPrompt,
              style: storyboard.musicStyle,
              title: theme,
            }),
          });
          const { taskId } = await mRes.json();
          update({ musicTaskId: taskId });

          // Poll music
          const result = await startPolling(
            "music",
            async () => {
              const r = await fetch(
                `/api/music/poll?taskId=${taskId}&projectId=${projectId}`
              );
              const data = await r.json();
              if (data.status === "SUCCESS")
                return { done: true, data: data.url };
              if (data.status === "FAILED")
                throw new Error("Music generation failed");
              return { done: false };
            },
            { interval: 10000, maxAttempts: 60 }
          );
          update({ musicUrl: result as string });
          return result as string;
        })();

        // 4. Generate images in parallel batches of 2 (Gemini can handle 2 concurrent requests)
        for (let batch = 0; batch < shots.length; batch += 2) {
          if (abortRef.current) return;

          const batchIndices = [batch];
          if (batch + 1 < shots.length) batchIndices.push(batch + 1);

          // Generate batch in parallel
          await Promise.all(
            batchIndices.map(async (i) => {
              const imgRes = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  shotIndex: i,
                  prompt: shots[i].imagePrompt,
                  refImages,
                }),
              });
              const { url } = await imgRes.json();
              updateShot(i, { imageUrl: url });
            })
          );

          update({
            progress: 15 + ((Math.min(batch + 2, shots.length)) / shots.length) * 20,
          });
        }

        if (abortRef.current) return;

        // 5. Upscale images
        update({ stage: "upscaling", progress: 38 });
        for (let i = 0; i < shots.length; i++) {
          if (abortRef.current) return;
          const upRes = await fetch("/api/upscale/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, shotIndex: i }),
          });
          const { taskId } = await upRes.json();
          updateShot(i, { upscaleTaskId: taskId });

          // Poll upscale
          const result = await startPolling(
            `upscale_${i}`,
            async () => {
              const r = await fetch(
                `/api/upscale/poll?taskId=${taskId}&projectId=${projectId}&shotIndex=${i}`
              );
              const data = await r.json();
              if (data.status === "COMPLETED")
                return { done: true, data: data.url };
              if (data.status === "FAILED")
                throw new Error(`Upscale failed for shot ${i}`);
              return { done: false };
            },
            { interval: 5000, maxAttempts: 120 }
          );
          updateShot(i, { upscaledUrl: result as string });
          update({ progress: 38 + ((i + 1) / shots.length) * 15 });
        }

        if (abortRef.current) return;

        // 6. Animate (batches of 2 for Kling limit)
        update({ stage: "animating", progress: 55 });
        for (let batch = 0; batch < shots.length; batch += 2) {
          if (abortRef.current) return;
          const batchIndices = [batch];
          if (batch + 1 < shots.length) batchIndices.push(batch + 1);

          // Start batch
          const batchTasks: { index: number; taskId: string; provider: string }[] = [];
          for (const idx of batchIndices) {
            const aRes = await fetch("/api/animate/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                shotIndex: idx,
                prompt: shots[idx].motionPrompt,
                aspectRatio: format,
              }),
            });
            const { taskId, provider } = await aRes.json();
            updateShot(idx, { animateTaskId: taskId });
            batchTasks.push({ index: idx, taskId, provider: provider || "kling" });
          }

          // Poll batch in parallel
          await Promise.all(
            batchTasks.map(async ({ index, taskId, provider }) => {
              const result = await startPolling(
                `animate_${index}`,
                async () => {
                  const r = await fetch(
                    `/api/animate/poll?taskId=${taskId}&projectId=${projectId}&shotIndex=${index}&provider=${provider}`
                  );
                  const data = await r.json();
                  if (data.status === "succeed")
                    return { done: true, data: data.url };
                  if (data.status === "failed")
                    throw new Error(`Animation failed for shot ${index}`);
                  return { done: false };
                },
                { interval: 15000, maxAttempts: 80 }
              );
              updateShot(index, { videoUrl: result as string });
            })
          );

          update({
            progress:
              55 +
              ((Math.min(batch + 2, shots.length)) / shots.length) * 25,
          });
        }

        if (abortRef.current) return;

        // Wait for music if not done
        update({ stage: "music", progress: 82 });
        const musicUrl = await musicPromise;

        if (abortRef.current) return;

        // 7. FFmpeg montage (in-browser)
        update({ stage: "montage", progress: 85 });

        // Get all video URLs and music URL from state
        // The montage will be done by the component using ffmpeg.wasm
        // We just signal that we're ready
        setState((prev) => ({
          ...prev,
          musicUrl: musicUrl || prev.musicUrl,
          stage: "montage",
          progress: 85,
        }));

        // The actual ffmpeg assembly happens in the component
        // It will call finalizePipeline when done
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pipeline error";
        update({ stage: "error", error: message });
      }
    },
    [update, updateShot, startPolling, stopAll]
  );

  const finalizePipeline = useCallback(
    async (videoBlob: Blob, serverUrl?: string) => {
      update({ finalVideoBlob: videoBlob, progress: 95 });

      // If we have a server URL (from server-side montage), use it directly
      if (serverUrl) {
        update({ finalVideoUrl: serverUrl, stage: "done", progress: 100 });
        return;
      }

      // Otherwise, upload the client-generated blob
      if (state.projectId && videoBlob.size > 0) {
        const formData = new FormData();
        formData.append("video", videoBlob, "final.mp4");

        const res = await fetch(
          `/api/project/${state.projectId}/finalize`,
          { method: "POST", body: formData }
        );
        const { url } = await res.json();
        update({ finalVideoUrl: url, stage: "done", progress: 100 });
      } else {
        update({ stage: "done", progress: 100 });
      }
    },
    [state.projectId, update]
  );

  const skipToMontage = useCallback(() => {
    // Allow manual trigger of montage stage
    update({ stage: "montage", progress: 85 });
  }, [update]);

  const resume = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/project/${projectId}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const pipelineState = data.pipelineState;
      if (!pipelineState) {
        throw new Error("No saved pipeline state found");
      }

      // Restore state
      setState({
        ...INITIAL_STATE,
        projectId,
        stage: pipelineState.stage,
        shots: pipelineState.shots || [],
        musicTaskId: pipelineState.musicTaskId,
        musicUrl: pipelineState.musicUrl,
        progress: pipelineState.progress,
      });

      // Determine where to resume based on stage
      // User will need to manually trigger continuation or we can auto-continue
      console.log(`Resumed project ${projectId} at stage: ${pipelineState.stage}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Resume failed";
      update({ stage: "error", error: message });
    }
  }, [update]);

  const continueFromStoryboard = useCallback(
    async (editedShots: Shot[], theme: string, files: File[], numShots: number, format: string) => {
      try {
        // Update shots with edited version
        setState((prev) => ({ ...prev, shots: editedShots }));

        if (abortRef.current) return;

        const projectId = state.projectId;
        if (!projectId) throw new Error("No project ID");

        // Convert ref images to base64 (if they exist)
        const refImages: { base64: string; mimeType: string }[] = [];
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const uint8 = new Uint8Array(bytes);
          let binary = "";
          const chunkSize = 8192;
          for (let offset = 0; offset < uint8.length; offset += chunkSize) {
            binary += String.fromCharCode(
              ...uint8.subarray(offset, offset + chunkSize)
            );
          }
          const base64 = btoa(binary);
          refImages.push({ base64, mimeType: file.type || "image/png" });
        }

        // Continue from generating stage
        update({ stage: "generating" });

        // 3. Start music in parallel
        const musicPromise = (async () => {
          // Fetch storyboard from R2 to get music prompts
          const sbRes = await fetch(`${process.env.NEXT_PUBLIC_R2_URL || "https://pub-536e22068e764b9bafbad4eae700ea0b.r2.dev"}/videoritz/${projectId}/storyboard.json`);
          const storyboard = await sbRes.json();

          const mRes = await fetch("/api/music/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: storyboard.musicPrompt,
              style: storyboard.musicStyle,
              title: theme,
            }),
          });
          const { taskId } = await mRes.json();
          update({ musicTaskId: taskId });

          const result = await startPolling(
            "music",
            async () => {
              const r = await fetch(
                `/api/music/poll?taskId=${taskId}&projectId=${projectId}`
              );
              const data = await r.json();
              if (data.status === "SUCCESS")
                return { done: true, data: data.url };
              if (data.status === "FAILED")
                throw new Error("Music generation failed");
              return { done: false };
            },
            { interval: 10000, maxAttempts: 60 }
          );
          update({ musicUrl: result as string });
          return result as string;
        })();

        // 4. Generate images in parallel batches of 2
        for (let batch = 0; batch < editedShots.length; batch += 2) {
          if (abortRef.current) return;

          const batchIndices = [batch];
          if (batch + 1 < editedShots.length) batchIndices.push(batch + 1);

          await Promise.all(
            batchIndices.map(async (i) => {
              const imgRes = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  shotIndex: i,
                  prompt: editedShots[i].imagePrompt,
                  refImages,
                }),
              });
              const { url } = await imgRes.json();
              updateShot(i, { imageUrl: url });
            })
          );

          update({
            progress: 15 + ((Math.min(batch + 2, editedShots.length)) / editedShots.length) * 20,
          });
        }

        if (abortRef.current) return;

        // 5. Upscale images
        update({ stage: "upscaling", progress: 38 });
        for (let i = 0; i < editedShots.length; i++) {
          if (abortRef.current) return;
          const upRes = await fetch("/api/upscale/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, shotIndex: i }),
          });
          const { taskId } = await upRes.json();
          updateShot(i, { upscaleTaskId: taskId });

          const result = await startPolling(
            `upscale_${i}`,
            async () => {
              const r = await fetch(
                `/api/upscale/poll?taskId=${taskId}&projectId=${projectId}&shotIndex=${i}`
              );
              const data = await r.json();
              if (data.status === "COMPLETED")
                return { done: true, data: data.url };
              if (data.status === "FAILED")
                throw new Error(`Upscale failed for shot ${i}`);
              return { done: false };
            },
            { interval: 5000, maxAttempts: 120 }
          );
          updateShot(i, { upscaledUrl: result as string });
          update({ progress: 38 + ((i + 1) / editedShots.length) * 15 });
        }

        if (abortRef.current) return;

        // 6. Animate (batches of 2 for Kling limit)
        update({ stage: "animating", progress: 55 });
        for (let batch = 0; batch < editedShots.length; batch += 2) {
          if (abortRef.current) return;
          const batchIndices = [batch];
          if (batch + 1 < editedShots.length) batchIndices.push(batch + 1);

          const batchTasks: { index: number; taskId: string }[] = [];
          for (const idx of batchIndices) {
            const aRes = await fetch("/api/animate/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                shotIndex: idx,
                prompt: editedShots[idx].motionPrompt,
              }),
            });
            const { taskId } = await aRes.json();
            updateShot(idx, { animateTaskId: taskId });
            batchTasks.push({ index: idx, taskId });
          }

          await Promise.all(
            batchTasks.map(async ({ index, taskId }) => {
              const result = await startPolling(
                `animate_${index}`,
                async () => {
                  const r = await fetch(
                    `/api/animate/poll?taskId=${taskId}&projectId=${projectId}&shotIndex=${index}`
                  );
                  const data = await r.json();
                  if (data.status === "succeed")
                    return { done: true, data: data.url };
                  if (data.status === "failed")
                    throw new Error(`Animation failed for shot ${index}`);
                  return { done: false };
                },
                { interval: 15000, maxAttempts: 80 }
              );
              updateShot(index, { videoUrl: result as string });
            })
          );

          update({
            progress:
              55 +
              ((Math.min(batch + 2, editedShots.length)) / editedShots.length) * 25,
          });
        }

        if (abortRef.current) return;

        // Wait for music if not done
        update({ stage: "music", progress: 82 });
        const musicUrl = await musicPromise;

        if (abortRef.current) return;

        // 7. FFmpeg montage
        update({ stage: "montage", progress: 85 });
        setState((prev) => ({
          ...prev,
          musicUrl: musicUrl || prev.musicUrl,
          stage: "montage",
          progress: 85,
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pipeline error";
        update({ stage: "error", error: message });
      }
    },
    [state.projectId, update, updateShot, startPolling]
  );

  return {
    state,
    run,
    reset,
    finalizePipeline,
    skipToMontage,
    updateShot,
    resume,
    saveState,
    continueFromStoryboard,
  };
}
