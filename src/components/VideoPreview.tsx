"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Download, Upload, Loader2, Play, AlertTriangle } from "lucide-react";
import { assembleMontage } from "@/lib/ffmpeg-montage";
import type { Shot } from "@/hooks/usePipeline";

interface VideoPreviewProps {
  shots: Shot[];
  musicUrl: string | null;
  stage: string;
  finalVideoUrl: string | null;
  finalVideoBlob: Blob | null;
  onFinalize: (blob: Blob, serverUrl?: string) => void;
}

export default function VideoPreview({
  shots,
  musicUrl,
  stage,
  finalVideoUrl,
  finalVideoBlob,
  onFinalize,
}: VideoPreviewProps) {
  const [assembling, setAssembling] = useState(false);
  const [assemblePct, setAssemblePct] = useState(0);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const didAssemble = useRef(false);

  const allVideosReady = shots.length > 0 && shots.every((s) => s.videoUrl);
  const canAssemble = allVideosReady && musicUrl && stage === "montage";

  // Auto-start assembly when ready
  useEffect(() => {
    if (canAssemble && !assembling && !finalVideoBlob && !didAssemble.current) {
      didAssemble.current = true;
      startAssembly();
    }
  }, [canAssemble, finalVideoBlob]);

  const startAssembly = useCallback(async () => {
    if (!allVideosReady || !musicUrl) return;

    setAssembling(true);
    setAssembleError(null);
    setAssemblePct(0);

    try {
      // Try server-side montage first
      setAssemblePct(10);
      const projectId = shots[0]?.videoUrl?.split("/")[4]; // Extract from URL: videoritz/PROJECT_ID/...

      if (projectId) {
        try {
          const serverRes = await fetch(`/api/project/${projectId}/finalize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (serverRes.ok) {
            const { url } = await serverRes.json();
            setAssemblePct(100);
            setLocalBlobUrl(url);
            // For server montage, we don't have a blob but we have the R2 URL
            // Create a fake blob and pass the server URL
            const fakeBlob = new Blob([], { type: "video/mp4" });
            onFinalize(fakeBlob, url);
            return;
          }

          // Server montage failed, fallback to client
          console.warn("Server montage failed, falling back to client-side");
        } catch (serverErr) {
          console.warn("Server montage error:", serverErr);
        }
      }

      // Fallback: Client-side montage with ffmpeg.wasm
      setAssemblePct(0);
      const videoUrls = shots.map((s) => s.videoUrl!);
      const blob = await assembleMontage(videoUrls, musicUrl, (pct) =>
        setAssemblePct(pct)
      );

      const url = URL.createObjectURL(blob);
      setLocalBlobUrl(url);
      onFinalize(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Montage failed";
      setAssembleError(msg);
    } finally {
      setAssembling(false);
    }
  }, [shots, musicUrl, allVideosReady, onFinalize]);

  const downloadVideo = useCallback(() => {
    const url = localBlobUrl || finalVideoUrl;
    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = "videoritz_final.mp4";
    a.click();
  }, [localBlobUrl, finalVideoUrl]);

  const downloadAssets = useCallback(() => {
    // Fallback: download individual clips + music
    for (const shot of shots) {
      if (shot.videoUrl) {
        const a = document.createElement("a");
        a.href = shot.videoUrl;
        a.download = `clip_${shot.index}.mp4`;
        a.target = "_blank";
        a.click();
      }
    }
    if (musicUrl) {
      const a = document.createElement("a");
      a.href = musicUrl;
      a.download = "music.mp3";
      a.target = "_blank";
      a.click();
    }
  }, [shots, musicUrl]);

  const previewUrl = localBlobUrl || finalVideoUrl;

  if (stage !== "montage" && stage !== "done") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <h3 className="text-sm font-semibold text-ritz-muted">
        Video finale
      </h3>

      {/* Assembly progress */}
      {assembling && (
        <div className="p-4 bg-ritz-card border border-ritz-border rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm text-ritz-accent">
            <Loader2 size={16} className="animate-spin" />
            Montage en cours... {assemblePct}%
          </div>
          <div className="h-2 bg-ritz-soft rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-ritz-accent rounded-full"
              style={{ width: `${assemblePct}%` }}
            />
          </div>
        </div>
      )}

      {/* Assembly error + fallback */}
      {assembleError && (
        <div className="p-4 bg-ritz-card border border-ritz-border rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm text-ritz-warning">
            <AlertTriangle size={16} />
            Montage navigateur echoue: {assembleError}
          </div>
          <button
            onClick={downloadAssets}
            className="flex items-center gap-2 px-4 py-2 bg-ritz-soft rounded-xl text-xs text-ritz-text hover:bg-ritz-border transition-colors cursor-pointer"
          >
            <Download size={14} />
            Telecharger clips + musique separement
          </button>
          <button
            onClick={() => {
              didAssemble.current = false;
              setAssembleError(null);
              startAssembly();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-ritz-accent/20 rounded-xl text-xs text-ritz-accent hover:bg-ritz-accent/30 transition-colors cursor-pointer"
          >
            <Play size={14} />
            Reessayer le montage
          </button>
        </div>
      )}

      {/* Video player */}
      {previewUrl && (
        <div className="space-y-3">
          <div className="relative aspect-[9/16] max-w-sm mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl shadow-ritz-accent/10">
            <video
              src={previewUrl}
              controls
              className="absolute inset-0 w-full h-full"
              playsInline
            />
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={downloadVideo}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-ritz-accent/30 transition-all cursor-pointer"
            >
              <Download size={14} />
              Telecharger
            </button>
            {finalVideoUrl && (
              <a
                href={finalVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-ritz-card border border-ritz-border text-ritz-text rounded-xl text-sm font-semibold hover:border-ritz-accent/50 transition-all"
              >
                <Upload size={14} />
                Lien R2
              </a>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
