"use client";

import ShotCard from "./ShotCard";
import type { Shot } from "@/hooks/usePipeline";

interface ShotGridProps {
  shots: Shot[];
  stage: string;
  format?: string;
  onRetry?: (shotIndex: number) => Promise<void>;
}

export default function ShotGrid({ shots, stage, format = "16:9", onRetry }: ShotGridProps) {
  if (shots.length === 0) return null;

  // Adjust grid columns based on shot count
  const gridCols = shots.length <= 4
    ? "grid-cols-2 md:grid-cols-4"
    : shots.length <= 6
      ? "grid-cols-3 md:grid-cols-6"
      : "grid-cols-4 md:grid-cols-5 lg:grid-cols-8";

  const failedCount = shots.filter((s) => s.failed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-ritz-muted">
          Storyboard — {shots.length} plans
        </h3>
        {failedCount > 0 && (
          <span className="text-[10px] font-medium text-ritz-error bg-ritz-error/10 px-2 py-0.5 rounded-full">
            {failedCount} echoue{failedCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className={`grid ${gridCols} gap-3`}>
        {shots.map((shot) => (
          <ShotCard key={shot.index} shot={shot} stage={stage} format={format} onRetry={onRetry} />
        ))}
      </div>
    </div>
  );
}
