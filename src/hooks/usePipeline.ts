"use client";

import { useState, useCallback, useRef } from "react";
import { usePolling } from "./usePolling";
import { compressImage } from "@/lib/image-utils";

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
  failed?: boolean;
  failError?: string;
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
  format: string;
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
  format: "16:9",
};

export function usePipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);
  const { startPolling, stopAll } = usePolling();
  const abortRef = useRef(false);
  // Use a ref to always read the latest state inside async callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  // Store ref images for retries
  const refImagesRef = useRef<{ base64: string; mimeType: string }[]>([]);

  const update = useCallback(
    (partial: Partial<PipelineState>) =>
      setState((prev) => ({ ...prev, ...partial })),
    []
  );

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

  // Save pipeline state to R2
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
          format: currentState.format,
        }),
      });
    } catch (err) {
      console.warn("Failed to save pipeline state:", err);
    }
  }, []);

  const reset = useCallback(() => {
    stopAll();
    abortRef.current = true;
    setState(INITIAL_STATE);
  }, [stopAll]);

  // ─── Helper: process a single shot through image → upscale → animate ───
  const processShot = useCallback(
    async (
      shot: Shot,
      projectId: string,
      refImages: { base64: string; mimeType: string }[],
      format: string,
      attempt = 1
    ) => {
      try {
        // Clear any previous failure
        updateShot(shot.index, { failed: false, failError: undefined });

        // 1. Generate image
        const imgRes = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            shotIndex: shot.index,
            prompt: shot.imagePrompt,
            refImages,
            format,
          }),
        });
        const imgData = await imgRes.json();
        if (!imgData.url) throw new Error(imgData.error || `Image generation failed`);
        updateShot(shot.index, { imageUrl: imgData.url });

        if (abortRef.current) return;

        // 2. Upscale
        const upRes = await fetch("/api/upscale/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, shotIndex: shot.index }),
        });
        const { taskId: upTaskId } = await upRes.json();
        updateShot(shot.index, { upscaleTaskId: upTaskId });

        const upscaledUrl = await startPolling(
          `upscale_${shot.index}`,
          async () => {
            const r = await fetch(
              `/api/upscale/poll?taskId=${upTaskId}&projectId=${projectId}&shotIndex=${shot.index}`
            );
            const data = await r.json();
            if (data.status === "COMPLETED") return { done: true, data: data.url };
            if (data.status === "FAILED") throw new Error(`Upscale failed`);
            return { done: false };
          },
          { interval: 5000, maxAttempts: 120 }
        );
        updateShot(shot.index, { upscaledUrl: upscaledUrl as string });

        if (abortRef.current) return;

        // 3. Animate
        const aRes = await fetch("/api/animate/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            shotIndex: shot.index,
            prompt: shot.motionPrompt,
            aspectRatio: format,
          }),
        });
        const { taskId: animTaskId, provider } = await aRes.json();
        updateShot(shot.index, { animateTaskId: animTaskId });

        const videoUrl = await startPolling(
          `animate_${shot.index}`,
          async () => {
            const r = await fetch(
              `/api/animate/poll?taskId=${animTaskId}&projectId=${projectId}&shotIndex=${shot.index}&provider=${provider || "kling"}`
            );
            const data = await r.json();
            if (data.status === "succeed") return { done: true, data: data.url };
            if (data.status === "failed") throw new Error(`Animation failed`);
            return { done: false };
          },
          { interval: 15000, maxAttempts: 80 }
        );
        updateShot(shot.index, { videoUrl: videoUrl as string });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";

        // Auto-retry once
        if (attempt < 2) {
          console.warn(`Shot ${shot.index} failed (attempt ${attempt}), retrying...`);
          await new Promise(r => setTimeout(r, 3000)); // Wait 3s before retry
          return processShot(shot, projectId, refImages, format, attempt + 1);
        }

        console.warn(`Shot ${shot.index} (${shot.name}) failed after ${attempt} attempts: ${message}`);
        updateShot(shot.index, { failed: true, failError: message });
      }
    },
    [updateShot, startPolling]
  );

  // ─── Main pipeline: parallel processing ───
  const runPipeline = useCallback(
    async (
      shots: Shot[],
      projectId: string,
      theme: string,
      refImages: { base64: string; mimeType: string }[],
      format: string
    ) => {
      try {
        update({ stage: "generating", progress: 16 });

        // Start music generation in parallel (fire and forget, await later)
        const musicPromise = (async () => {
          // Fetch storyboard via API to avoid CORS issues with R2
          const sbRes = await fetch(`/api/project/${projectId}`);
          const projectData = await sbRes.json();
          const storyboard = projectData.storyboard || {};

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
              if (data.status === "SUCCESS") return { done: true, data: data.url };
              if (data.status === "FAILED") throw new Error("Music generation failed");
              return { done: false };
            },
            { interval: 10000, maxAttempts: 60 }
          );
          update({ musicUrl: result as string });
          return result as string;
        })();

        // Process shots in parallel batches of 3 (image → upscale → animate per shot)
        // Each shot handles its own errors — failed shots are marked but don't block others
        const BATCH_SIZE = 3;
        for (let batch = 0; batch < shots.length; batch += BATCH_SIZE) {
          if (abortRef.current) return;

          const batchShots = shots.slice(batch, batch + BATCH_SIZE);

          // Update stage based on what the batch is doing
          const batchProgress = batch / shots.length;
          if (batchProgress < 0.33) update({ stage: "generating" });
          else if (batchProgress < 0.66) update({ stage: "upscaling" });
          else update({ stage: "animating" });

          await Promise.allSettled(
            batchShots.map((shot) =>
              processShot(shot, projectId, refImages, format)
            )
          );

          const completedShots = Math.min(batch + BATCH_SIZE, shots.length);
          update({
            progress: 16 + (completedShots / shots.length) * 64,
          });

          // Save state after each batch
          const currentState = stateRef.current;
          await saveState({
            ...currentState,
            progress: 16 + (completedShots / shots.length) * 64,
          });
        }

        if (abortRef.current) return;

        // Check how many shots succeeded
        const latestShots = stateRef.current.shots;
        const successCount = latestShots.filter((s) => s.videoUrl).length;
        const failCount = latestShots.filter((s) => s.failed).length;

        if (successCount === 0) {
          update({ stage: "error", error: `All ${failCount} shots failed. Check your API keys.` });
          return;
        }

        // Wait for music
        update({ stage: "music", progress: 82 });
        const musicUrl = await musicPromise;

        if (abortRef.current) return;

        // Trigger montage (even with partial shots)
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
    [update, processShot, startPolling, saveState]
  );

  // ─── Entry point: start from form submission ───
  const run = useCallback(
    async (
      theme: string,
      files: File[],
      numShots = 6,
      format = "16:9",
      videoRefDescription?: string
    ) => {
      abortRef.current = false;

      try {
        // 1. Upload refs
        update({ stage: "uploading", progress: 2, format });
        const formData = new FormData();
        formData.append("theme", theme);
        formData.append("numShots", numShots.toString());
        formData.append("format", format);
        files.forEach((f) => formData.append("refs", f));

        const createRes = await fetch("/api/project/create", {
          method: "POST",
          body: formData,
        });
        if (!createRes.ok) {
          const errText = await createRes.text().catch(() => "");
          let errMsg = `Server error ${createRes.status}`;
          try { const errJson = JSON.parse(errText); errMsg = errJson.error || errMsg; } catch {}
          throw new Error(errMsg);
        }
        const createData = await createRes.json();
        const { projectId } = createData;
        if (!projectId) throw new Error("Failed to create project");
        update({ projectId, progress: 5 });

        if (abortRef.current) return;

        // 2. Storyboard
        update({ stage: "storyboard", progress: 8 });

        const refImages: { base64: string; mimeType: string }[] = [];
        for (const file of files) {
          const compressed = await compressImage(file);
          refImages.push(compressed);
        }
        refImagesRef.current = refImages;

        const sbRes = await fetch("/api/storyboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            theme,
            numShots,
            refImages,
            videoRefDescription,
          }),
        });
        const storyboard = await sbRes.json();
        if (storyboard.error) throw new Error(`Storyboard: ${storyboard.error}`);
        if (!storyboard.shots) throw new Error("Storyboard: no shots returned");

        const shots: Shot[] = storyboard.shots.map(
          (s: Shot, i: number) => ({ ...s, index: i })
        );

        // Move to storyboard-review
        update({ shots, stage: "storyboard-review", progress: 15 });

        await saveState({
          ...stateRef.current,
          projectId,
          stage: "storyboard-review",
          shots,
          progress: 15,
          musicTaskId: null,
          musicUrl: null,
          finalVideoUrl: null,
          finalVideoBlob: null,
          error: null,
          format,
        });

        // Pipeline pauses here until user confirms
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Pipeline error";
        update({ stage: "error", error: message });
      }
    },
    [update, saveState]
  );

  // ─── Continue from storyboard review ───
  const continueFromStoryboard = useCallback(
    async (
      editedShots: Shot[],
      theme: string,
      files: File[],
      numShots: number,
      format: string
    ) => {
      setState((prev) => ({ ...prev, shots: editedShots }));

      const projectId = stateRef.current.projectId;
      if (!projectId) {
        update({ stage: "error", error: "No project ID" });
        return;
      }

      // Convert ref images (with compression)
      const refImages: { base64: string; mimeType: string }[] = [];
      for (const file of files) {
        const compressed = await compressImage(file);
        refImages.push(compressed);
      }
      refImagesRef.current = refImages;

      await runPipeline(editedShots, projectId, theme, refImages, format);
    },
    [update, runPipeline]
  );

  // ─── Resume from saved state ───
  const resume = useCallback(
    async (projectId: string) => {
      try {
        const res = await fetch(`/api/project/${projectId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const pipelineState = data.pipelineState;
        if (!pipelineState) throw new Error("No saved pipeline state found");

        // Restore state
        setState({
          ...INITIAL_STATE,
          projectId,
          stage: pipelineState.stage,
          shots: pipelineState.shots || [],
          musicTaskId: pipelineState.musicTaskId,
          musicUrl: pipelineState.musicUrl,
          progress: pipelineState.progress,
          format: pipelineState.format || "16:9",
        });

        // Auto-continue: find incomplete shots and resume processing
        const savedShots: Shot[] = pipelineState.shots || [];
        const incompleteShots = savedShots.filter((s: Shot) => !s.videoUrl);

        if (incompleteShots.length > 0 && pipelineState.stage !== "storyboard-review") {
          // Resume pipeline for incomplete shots
          abortRef.current = false;
          await runPipeline(incompleteShots, projectId, data.theme || "", [], pipelineState.format || "16:9");
        } else if (pipelineState.stage === "montage" || savedShots.every((s: Shot) => s.videoUrl)) {
          // All shots complete, trigger montage
          update({ stage: "montage", progress: 85 });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Resume failed";
        update({ stage: "error", error: message });
      }
    },
    [update, runPipeline]
  );

  const finalizePipeline = useCallback(
    async (videoBlob: Blob, serverUrl?: string) => {
      update({ finalVideoBlob: videoBlob, progress: 95 });

      if (serverUrl) {
        update({ finalVideoUrl: serverUrl, stage: "done", progress: 100 });
        // Save final state
        const currentState = stateRef.current;
        await saveState({ ...currentState, stage: "done", progress: 100 });
        return;
      }

      const pid = stateRef.current.projectId;
      if (pid && videoBlob.size > 0) {
        const formData = new FormData();
        formData.append("video", videoBlob, "final.mp4");
        const res = await fetch(`/api/project/${pid}/finalize`, {
          method: "POST",
          body: formData,
        });
        const { url } = await res.json();
        update({ finalVideoUrl: url, stage: "done", progress: 100 });
        const currentState = stateRef.current;
        await saveState({ ...currentState, finalVideoUrl: url, stage: "done", progress: 100 });
      } else {
        update({ stage: "done", progress: 100 });
      }
    },
    [update, saveState]
  );

  const skipToMontage = useCallback(() => {
    update({ stage: "montage", progress: 85 });
  }, [update]);

  // ─── Retry a single failed shot ───
  const retryShot = useCallback(
    async (shotIndex: number) => {
      const currentState = stateRef.current;
      const shot = currentState.shots.find((s) => s.index === shotIndex);
      const projectId = currentState.projectId;
      if (!shot || !projectId) return;

      await processShot(shot, projectId, refImagesRef.current, currentState.format);

      // Save state after retry
      await saveState(stateRef.current);
    },
    [processShot, saveState]
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
    retryShot,
  };
}
