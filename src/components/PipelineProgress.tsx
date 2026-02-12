"use client";

import { motion } from "framer-motion";
import {
  Upload,
  BookOpen,
  ImagePlus,
  ArrowUpCircle,
  Film,
  Music,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { PipelineStage } from "@/hooks/usePipeline";

interface PipelineProgressProps {
  stage: PipelineStage;
  progress: number;
  error: string | null;
}

const STAGES: {
  key: PipelineStage;
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: "uploading", label: "Upload", icon: <Upload size={14} /> },
  { key: "storyboard", label: "Storyboard", icon: <BookOpen size={14} /> },
  { key: "generating", label: "Images", icon: <ImagePlus size={14} /> },
  { key: "upscaling", label: "Upscale", icon: <ArrowUpCircle size={14} /> },
  { key: "animating", label: "Animation", icon: <Film size={14} /> },
  { key: "music", label: "Musique", icon: <Music size={14} /> },
  { key: "montage", label: "Montage", icon: <Scissors size={14} /> },
  { key: "done", label: "Fini", icon: <CheckCircle2 size={14} /> },
];

function getStageIndex(stage: PipelineStage): number {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : -1;
}

export default function PipelineProgress({
  stage,
  progress,
  error,
}: PipelineProgressProps) {
  if (stage === "idle") return null;

  const currentIdx = getStageIndex(stage);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="relative h-2 bg-ritz-soft rounded-full overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${
            error
              ? "bg-ritz-error"
              : stage === "done"
                ? "bg-ritz-success"
                : "bg-gradient-to-r from-ritz-accent to-purple-500"
          }`}
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        {stage !== "done" && stage !== "error" && (
          <motion.div
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ left: ["-20%", "120%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {STAGES.map((s, i) => {
          const isDone = currentIdx > i || stage === "done";
          const isActive = currentIdx === i && stage !== "done";

          return (
            <div
              key={s.key}
              className={`flex flex-col items-center gap-1 ${
                isDone
                  ? "text-ritz-success"
                  : isActive
                    ? "text-ritz-accent"
                    : "text-ritz-muted/30"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isDone
                    ? "bg-ritz-success/20"
                    : isActive
                      ? "bg-ritz-accent/20"
                      : "bg-ritz-soft"
                }`}
              >
                {isActive ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  s.icon
                )}
              </div>
              <span className="text-[10px] font-medium hidden sm:block">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 bg-ritz-error/10 border border-ritz-error/30 rounded-xl text-sm text-ritz-error"
        >
          <AlertCircle size={16} />
          {error}
        </motion.div>
      )}
    </div>
  );
}
