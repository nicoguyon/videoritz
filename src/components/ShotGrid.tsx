"use client";

import ShotCard from "./ShotCard";
import type { Shot } from "@/hooks/usePipeline";

interface ShotGridProps {
  shots: Shot[];
  stage: string;
}

export default function ShotGrid({ shots, stage }: ShotGridProps) {
  if (shots.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-ritz-muted">
        Storyboard — {shots.length} plans
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {shots.map((shot) => (
          <ShotCard key={shot.index} shot={shot} stage={stage} />
        ))}
      </div>
    </div>
  );
}
