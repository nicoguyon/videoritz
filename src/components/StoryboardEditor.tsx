"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Edit3, Play, Save } from "lucide-react";
import type { Shot } from "@/hooks/usePipeline";

interface StoryboardEditorProps {
  shots: Shot[];
  onConfirm: (editedShots: Shot[]) => void;
  onCancel: () => void;
}

export default function StoryboardEditor({
  shots,
  onConfirm,
  onCancel,
}: StoryboardEditorProps) {
  const [editedShots, setEditedShots] = useState<Shot[]>(shots);

  const updateShot = (index: number, field: keyof Shot, value: string) => {
    setEditedShots((prev) =>
      prev.map((s) =>
        s.index === index ? { ...s, [field]: value } : s
      )
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Edit3 size={20} className="text-ritz-accent" />
          Éditeur de Storyboard
        </h3>
        <p className="text-sm text-ritz-muted max-w-lg mx-auto">
          Modifiez les plans générés par Claude avant de lancer la génération des images
        </p>
      </div>

      <div className="space-y-4">
        {editedShots.map((shot) => (
          <motion.div
            key={shot.index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: shot.index * 0.05 }}
            className="p-4 bg-ritz-card border border-ritz-border rounded-2xl space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-ritz-accent/20 flex items-center justify-center text-xs font-bold text-ritz-accent">
                {shot.index + 1}
              </div>
              <input
                type="text"
                value={shot.name}
                onChange={(e) => updateShot(shot.index, "name", e.target.value)}
                className="flex-1 h-9 bg-ritz-soft border border-ritz-border rounded-lg px-3 text-sm font-medium outline-none transition-all focus:border-ritz-accent focus:ring-2 focus:ring-ritz-accent/20"
                placeholder="Nom du plan"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ritz-muted mb-1.5">
                Prompt image (Gemini)
              </label>
              <textarea
                value={shot.imagePrompt}
                onChange={(e) =>
                  updateShot(shot.index, "imagePrompt", e.target.value)
                }
                rows={3}
                className="w-full bg-ritz-soft border border-ritz-border rounded-lg px-3 py-2 text-sm outline-none transition-all resize-none focus:border-ritz-accent focus:ring-2 focus:ring-ritz-accent/20"
                placeholder="Description détaillée de l'image..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ritz-muted mb-1.5">
                Prompt mouvement (Kling)
              </label>
              <textarea
                value={shot.motionPrompt}
                onChange={(e) =>
                  updateShot(shot.index, "motionPrompt", e.target.value)
                }
                rows={2}
                className="w-full bg-ritz-soft border border-ritz-border rounded-lg px-3 py-2 text-sm outline-none transition-all resize-none focus:border-ritz-accent focus:ring-2 focus:ring-ritz-accent/20"
                placeholder="Description du mouvement caméra..."
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 justify-center pt-4">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-ritz-soft hover:bg-ritz-border text-ritz-text rounded-xl text-sm font-semibold transition-all cursor-pointer"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(editedShots)}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-ritz-accent/30 transition-all cursor-pointer"
        >
          <Play size={16} />
          Lancer la génération
        </button>
      </div>
    </motion.div>
  );
}
