"use client";

import { motion } from "framer-motion";
import {
  Image as ImageIcon,
  ArrowUpCircle,
  Film,
  Check,
  Loader2,
} from "lucide-react";
import type { Shot } from "@/hooks/usePipeline";

interface ShotCardProps {
  shot: Shot;
  stage: string;
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

export default function ShotCard({ shot, stage }: ShotCardProps) {
  const steps = getSteps(shot, stage);
  const previewUrl = shot.upscaledUrl || shot.imageUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shot.index * 0.05 }}
      className="relative bg-ritz-card border border-ritz-border rounded-2xl overflow-hidden group hover:border-ritz-accent/30 transition-all duration-300"
    >
      {/* Image/Video preview */}
      <div className="aspect-[9/16] bg-ritz-soft relative overflow-hidden">
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

        {/* Step indicators */}
        <div className="flex gap-1.5">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                step.status === "done"
                  ? "bg-ritz-success/20 text-ritz-success"
                  : step.status === "active"
                    ? "bg-ritz-accent/20 text-ritz-accent"
                    : "bg-ritz-soft text-ritz-muted/50"
              }`}
            >
              {step.status === "active" ? (
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
    </motion.div>
  );
}
