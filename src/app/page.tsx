"use client";

import { useState, useEffect, useRef } from "react";
import { Film, RotateCcw, Play, Folder } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import ProjectForm, { type VideoFormat } from "@/components/ProjectForm";
import PipelineProgress from "@/components/PipelineProgress";
import ShotGrid from "@/components/ShotGrid";
import VideoPreview from "@/components/VideoPreview";
import StoryboardEditor from "@/components/StoryboardEditor";
import { usePipeline } from "@/hooks/usePipeline";

export default function Home() {
  const { state, run, reset, finalizePipeline, resume, continueFromStoryboard, retryShot } = usePipeline();
  const [resumeId, setResumeId] = useState("");
  const [formData, setFormData] = useState<{
    theme: string;
    files: File[];
    numShots: number;
    format: VideoFormat;
  } | null>(null);
  const didAutoResume = useRef(false);

  // Browser notification when pipeline completes
  useEffect(() => {
    if (state.stage === "done") {
      // Play a subtle sound
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgkKuwo3VLOFKGr7Ssf1A7TIGpr6x+UDtNgqiurH9PO02BqK6sgE87TYGorqyATztNgaiurIBPO02BqK6sgE87TYGorqyATztNgqiurH9QO02BqK6sf1A7TICprqx/UDxOgamuq39QO02BqK6sf1A7TYGorqyATztNgaiurIBPO02BqK6sgE87TYGorqyATztNgaiurIBPO02BqK6sgE87TYGorqx/UDtNgaiurH9QO02Bqa6rf1A7TYKprqt/UDtNg6muq39QO0yDqa6sf1A7TIOprqt/UDtMg6muq39QO0yDqa6rf1E7TIOprqt/UDtNg6muq39QO0yDqa6rf1A7TIOprqt/UDtMg6muq39QO0yDqa6rf1A7TIOprqt/UDtMg6murH9QO0yDqa6rf1A7TIOprqt/UDtMg6murH9QO0yDqa6rf1A7TIOprqx/UDtMg6murH9QO0yDqa6sf1A7TIKprqx/UDtNgqiurH9QO02BqK6sf1A7TYGorqx/UDtNgaiurH9QO02BqK6sf1A7TYGorqx/UDtNgaiurH9QO02BqK6sgE87TYGorqyATztN");
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}

      // Browser notification
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("VideoRitz", {
          body: "Votre video cinematique est prete !",
          icon: "/next.svg",
        });
      }
    }
  }, [state.stage]);

  // Auto-resume from URL ?resume=projectId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeParam = params.get("resume");
    if (resumeParam && state.stage === "idle" && !didAutoResume.current) {
      didAutoResume.current = true;
      resume(resumeParam);
    }
  }, [state.stage, resume]);

  const isRunning =
    state.stage !== "idle" && state.stage !== "done" && state.stage !== "error";

  const handleFormSubmit = (
    theme: string,
    files: File[],
    numShots: number,
    format: VideoFormat,
    videoRefDescription?: string
  ) => {
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    setFormData({ theme, files, numShots, format });
    run(theme, files, numShots, format, videoRefDescription);
  };

  // Determine video aspect ratio class for preview
  const getAspectClass = () => {
    switch (state.format) {
      case "9:16": return "aspect-[9/16]";
      case "1:1": return "aspect-square";
      default: return "aspect-video";
    }
  };

  return (
    <main className="min-h-screen bg-ritz-bg text-ritz-text font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-ritz-border bg-ritz-bg/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-ritz-accent to-ritz-accent-hover shadow-lg shadow-ritz-accent/25">
              <Film size={18} className="text-ritz-bg sm:hidden" strokeWidth={2.5} />
              <Film size={20} className="text-ritz-bg hidden sm:block" strokeWidth={2.5} />
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.2, 0.4, 0.2],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 rounded-xl bg-ritz-accent/40 blur-md"
              />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-display font-semibold tracking-wide text-ritz-accent">
                VideoRitz
              </h1>
              <p className="text-[10px] sm:text-[11px] text-ritz-muted/80 font-light hidden sm:block">
                Excellence cinematique par l&apos;intelligence artificielle
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/projects"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-medium text-ritz-muted hover:text-ritz-accent bg-ritz-card hover:bg-ritz-soft border border-ritz-border hover:border-ritz-accent/30 rounded-lg transition-all duration-300"
            >
              <Folder size={13} />
              <span className="hidden sm:inline">Projets</span>
            </Link>
            {state.stage !== "idle" && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-medium text-ritz-accent hover:text-ritz-accent-hover bg-ritz-card hover:bg-ritz-soft border border-ritz-accent/30 hover:border-ritz-accent rounded-lg transition-all duration-300 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Nouveau</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-10">
        {/* Form section */}
        {(state.stage === "idle" || state.stage === "error") && (
          <section className="space-y-6 sm:space-y-8">
            <div className="text-center space-y-2 sm:space-y-3">
              <h2 className="text-2xl sm:text-3xl font-display font-semibold text-ritz-accent">
                Creez votre video cinematique
              </h2>
              <p className="text-xs sm:text-sm text-ritz-muted/90 max-w-md mx-auto leading-relaxed px-2">
                Uploadez des images de reference et decrivez votre theme.
                L&apos;IA genere un storyboard, les images, les animations et la
                musique automatiquement.
              </p>
            </div>

            <ProjectForm onSubmit={handleFormSubmit} disabled={isRunning} />

            {/* Resume section */}
            <div className="p-5 bg-ritz-card/50 border border-ritz-border/50 rounded-2xl space-y-3 backdrop-blur-sm">
              <label className="block text-xs font-medium text-ritz-muted">
                Reprendre un projet existant
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resumeId}
                  onChange={(e) => setResumeId(e.target.value)}
                  placeholder="ID du projet (ex: a2cb62f7)"
                  className="flex-1 h-10 bg-ritz-soft border border-ritz-border rounded-xl px-3 text-sm outline-none transition-all duration-300 focus:border-ritz-accent focus:ring-2 focus:ring-ritz-accent/20 placeholder:text-ritz-muted/50"
                  disabled={isRunning}
                />
                <button
                  onClick={() => {
                    if (resumeId.trim()) {
                      resume(resumeId.trim());
                    }
                  }}
                  disabled={isRunning || !resumeId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-ritz-soft hover:bg-ritz-border rounded-xl text-xs font-semibold text-ritz-text transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Play size={14} />
                  Reprendre
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Pipeline progress */}
        {state.stage !== "idle" && state.stage !== "storyboard-review" && (
          <PipelineProgress
            stage={state.stage}
            progress={state.progress}
            error={state.error}
          />
        )}

        {/* Storyboard editor */}
        {state.stage === "storyboard-review" && formData && (
          <StoryboardEditor
            shots={state.shots}
            onConfirm={(editedShots) => {
              continueFromStoryboard(
                editedShots,
                formData.theme,
                formData.files,
                formData.numShots,
                formData.format
              );
            }}
            onCancel={reset}
          />
        )}

        {/* Shot grid */}
        {state.stage !== "storyboard-review" && (
          <ShotGrid shots={state.shots} stage={state.stage} format={state.format} onRetry={retryShot} />
        )}

        {/* Music status */}
        {state.musicTaskId && !state.musicUrl && (
          <div className="flex items-center gap-2 p-3 bg-ritz-card border border-ritz-border rounded-xl text-xs text-ritz-muted">
            <div className="w-3 h-3 border-2 border-ritz-accent/30 border-t-ritz-accent rounded-full animate-spin" />
            Generation de la musique en cours...
          </div>
        )}
        {state.musicUrl && (
          <div className="flex items-center gap-3 p-3 bg-ritz-card border border-ritz-border rounded-xl">
            <div className="w-6 h-6 rounded-full bg-ritz-success/20 flex items-center justify-center">
              <span className="text-ritz-success text-xs">&#9835;</span>
            </div>
            <span className="text-xs text-ritz-muted">Musique prete</span>
            <audio src={state.musicUrl} controls className="h-8 flex-1" />
          </div>
        )}

        {/* Video preview + montage */}
        <VideoPreview
          shots={state.shots}
          musicUrl={state.musicUrl}
          stage={state.stage}
          finalVideoUrl={state.finalVideoUrl}
          finalVideoBlob={state.finalVideoBlob}
          onFinalize={finalizePipeline}
          format={state.format}
        />

        {/* Done celebration */}
        {state.stage === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center p-8 bg-ritz-card border border-ritz-success/30 rounded-2xl"
          >
            <div className="text-4xl mb-3">&#127916;</div>
            <h3 className="text-lg font-semibold">Video generee !</h3>
            <p className="text-sm text-ritz-muted mt-1">
              Votre video cinematique est prete. Telechargez-la ou partagez le
              lien R2.
            </p>
            {state.projectId && (
              <p className="text-xs text-ritz-muted/60 mt-2 font-mono">
                Projet : {state.projectId}
              </p>
            )}
          </motion.div>
        )}
      </div>

      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-ritz-accent/8 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-ritz-soft/30 blur-[180px] rounded-full" />
        <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] bg-ritz-accent/5 blur-[120px] rounded-full" />
      </div>
    </main>
  );
}
