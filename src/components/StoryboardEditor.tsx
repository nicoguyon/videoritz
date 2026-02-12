"use client";

import { useState, useCallback } from "react";
import { motion, Reorder } from "framer-motion";
import { Edit3, Play, Trash2, Plus, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
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

  const deleteShot = useCallback((index: number) => {
    setEditedShots((prev) => {
      const filtered = prev.filter((s) => s.index !== index);
      // Re-index
      return filtered.map((s, i) => ({ ...s, index: i }));
    });
  }, []);

  const addShot = useCallback(() => {
    setEditedShots((prev) => [
      ...prev,
      {
        index: prev.length,
        name: `Plan ${prev.length + 1}`,
        imagePrompt: "",
        motionPrompt: "",
        musicCue: "",
      },
    ]);
  }, []);

  const moveShot = useCallback((fromIndex: number, direction: "up" | "down") => {
    setEditedShots((prev) => {
      const arr = [...prev];
      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= arr.length) return prev;

      // Find shots by their current position
      const fromPos = arr.findIndex((s) => s.index === fromIndex);
      const toPos = arr.findIndex((s) => s.index === toIndex);
      if (fromPos === -1 || toPos === -1) return prev;

      [arr[fromPos], arr[toPos]] = [arr[toPos], arr[fromPos]];
      // Re-index
      return arr.map((s, i) => ({ ...s, index: i }));
    });
  }, []);

  const handleReorder = useCallback((newOrder: Shot[]) => {
    // Re-index after reorder
    setEditedShots(newOrder.map((s, i) => ({ ...s, index: i })));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Edit3 size={20} className="text-ritz-accent" />
          Editeur de Storyboard
        </h3>
        <p className="text-sm text-ritz-muted max-w-lg mx-auto">
          Modifiez, reordonnez ou supprimez les plans avant la generation. Glissez pour reordonner.
        </p>
      </div>

      <Reorder.Group
        axis="y"
        values={editedShots}
        onReorder={handleReorder}
        className="space-y-4"
      >
        {editedShots.map((shot) => (
          <Reorder.Item
            key={shot.index}
            value={shot}
            className="p-4 bg-ritz-card border border-ritz-border rounded-2xl space-y-3 cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 text-ritz-muted/40 cursor-grab">
                <GripVertical size={16} />
              </div>
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveShot(shot.index, "up")}
                  disabled={shot.index === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-ritz-soft hover:bg-ritz-border text-ritz-muted disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveShot(shot.index, "down")}
                  disabled={shot.index === editedShots.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-ritz-soft hover:bg-ritz-border text-ritz-muted disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteShot(shot.index)}
                  disabled={editedShots.length <= 2}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-ritz-error/10 hover:bg-ritz-error/20 text-ritz-error disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
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
                placeholder="Description detaillee de l'image..."
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
                placeholder="Description du mouvement camera..."
              />
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* Add shot button */}
      <button
        type="button"
        onClick={addShot}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-ritz-border hover:border-ritz-accent/50 rounded-2xl text-xs font-medium text-ritz-muted hover:text-ritz-accent transition-all cursor-pointer"
      >
        <Plus size={14} />
        Ajouter un plan
      </button>

      <div className="flex gap-3 justify-center pt-4">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-ritz-soft hover:bg-ritz-border text-ritz-text rounded-xl text-sm font-semibold transition-all cursor-pointer"
        >
          Annuler
        </button>
        <button
          onClick={() => onConfirm(editedShots)}
          disabled={editedShots.length < 2 || editedShots.some((s) => !s.imagePrompt.trim())}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-ritz-accent/30 transition-all disabled:opacity-50 cursor-pointer"
        >
          <Play size={16} />
          Lancer la generation ({editedShots.length} plans)
        </button>
      </div>
    </motion.div>
  );
}
