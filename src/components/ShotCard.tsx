"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Image as ImageIcon,
  ArrowUpCircle,
  Film,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import type { Shot } from "@/hooks/usePipeline";

interface ShotCardProps {
  shot: Shot;
  stage: string;
  format?: string;
  onRetry?: (shotIndex: number) => Promise<void>;
}

type StepStatus = "pending" | "active" | "done";

function getSteps(
  shot: Shot,
  stage: string
): { label: string; icon: React.ReactNode; status: StepStatus }[] {
  const hasImage = !!shot.imageUrl;
  const hasUpscale = !!shot.upscaledUrl;
  const hasVideo = !!shot.videoUrl;

  return [
    {
      label: "Image",
      icon: <ImageIcon size={12} />,
      status: hasImage
        ? "done"
        : stage === "generating"
          ? "active"
          : "pending",
    },
    {
      label: "Upscale",
      icon: <ArrowUpCircle size={12} />,
      status: hasUpscale
        ? "done"
        : hasImage && (stage === "upscaling" || !!shot.upscaleTaskId)
          ? "active"
          : "pending",
    },
    {
      label: "Video",
      icon: <Film size={12} />,
      status: hasVideo
        ? "done"
        : hasUpscale && (stage === "animating" || !!shot.animateTaskId)
          ? "active"
          : "pending",
    },
  ];
}

export default function ShotCard({ shot, stage, format = "16:9", onRetry }: ShotCardProps) {
  const steps = getSteps(shot, stage);
  const previewUrl = shot.upscaledUrl || shot.imageUrl;
  const [retrying, setRetrying] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const getAspectClass = () => {
    switch (format) {
      case "9:16": return "aspect-[9/16]";
      case "1:1": return "aspect-square";
      default: return "aspect-video";
    }
  };

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry(shot.index);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shot.index * 0.05 }}
      className={`relative bg-ritz-card border rounded-2xl overflow-hidden group transition-all duration-300 ${
        shot.failed ? "border-ritz-error/50" : "border-ritz-border hover:border-ritz-accent/30"
      }`}
    >
      {/* Image/Video preview */}
      <div
        className={`${getAspectClass()} bg-ritz-soft relative overflow-hidden ${previewUrl ? "cursor-pointer" : ""}`}
        onClick={() => previewUrl && setLightboxOpen(true)}
      >
        {shot.videoUrl ? (
          <video
            src={shot.videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt={shot.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : shot.failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ritz-error/5">
            <AlertTriangle size={20} className="text-ritz-error/70" />
            {onRetry && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ritz-error/10 hover:bg-ritz-error/20 text-ritz-error text-[10px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <RefreshCw size={10} />
                )}
                {retrying ? "Retry..." : "Retry"}
              </button>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-ritz-accent/20 flex items-center justify-center">
              <ImageIcon size={16} className="text-ritz-muted" />
            </div>
          </div>
        )}

        {/* Shot index badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-semibold text-white backdrop-blur-sm">
          Plan {shot.index + 1}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-medium truncate">{shot.name}</p>

        {/* Error message */}
        {shot.failed && shot.failError && (
          <p className="text-[10px] text-ritz-error truncate" title={shot.failError}>
            {shot.failError}
          </p>
        )}

        {/* Step indicators */}
        <div className="flex gap-1.5">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                shot.failed
                  ? "bg-ritz-error/10 text-ritz-error/60"
                  : step.status === "done"
                    ? "bg-ritz-success/20 text-ritz-success"
                    : step.status === "active"
                      ? "bg-ritz-accent/20 text-ritz-accent"
                      : "bg-ritz-soft text-ritz-muted/50"
              }`}
            >
              {shot.failed ? (
                <AlertTriangle size={10} />
              ) : step.status === "active" ? (
                <Loader2 size={10} className="animate-spin" />
              ) : step.status === "done" ? (
                <Check size={10} />
              ) : (
                step.icon
              )}
              {step.label}
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
          {shot.videoUrl ? (
            <video
              src={shot.videoUrl}
              className="max-w-full max-h-full rounded-lg"
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={previewUrl}
              alt={shot.name}
              className="max-w-full max-h-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
            Plan {shot.index + 1} — {shot.name}
          </div>
        </div>
      )}
    </motion.div>
  );
}
