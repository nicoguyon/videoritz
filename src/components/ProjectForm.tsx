"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Film, Sparkles, ImagePlus } from "lucide-react";

export type VideoFormat = "9:16" | "16:9" | "1:1";

interface ProjectFormProps {
  onSubmit: (theme: string, files: File[], numShots: number, format: VideoFormat) => void;
  disabled: boolean;
}

export default function ProjectForm({ onSubmit, disabled }: ProjectFormProps) {
  const [theme, setTheme] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [numShots, setNumShots] = useState<number>(6);
  const [format, setFormat] = useState<VideoFormat>("16:9");

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles).filter((f) =>
      f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...fileArray]);

    for (const file of fileArray) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme.trim()) return;
    onSubmit(theme.trim(), files, numShots, format);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-7 bg-ritz-card/50 border border-ritz-border/50 rounded-3xl p-8 backdrop-blur-sm">
      {/* Theme input */}
      <div>
        <label className="block text-xs font-medium text-ritz-muted mb-2">
          Theme de la video
        </label>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Ex: Danse classique au Ritz Paris, coucher de soleil sur Tokyo..."
          className="w-full h-12 bg-ritz-card border border-ritz-border rounded-xl px-4 text-sm outline-none transition-all duration-300 focus:border-ritz-accent focus:ring-2 focus:ring-ritz-accent/20 placeholder:text-ritz-muted/50"
          required
          disabled={disabled}
        />
      </div>

      {/* Format selector */}
      <div>
        <label className="block text-xs font-medium text-ritz-muted mb-2">
          Format vidéo
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["9:16", "16:9", "1:1"] as VideoFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              disabled={disabled}
              className={`h-11 rounded-xl text-sm font-medium transition-all duration-300 ${
                format === f
                  ? "bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg shadow-md shadow-ritz-accent/25 border border-ritz-accent"
                  : "bg-ritz-card border border-ritz-border text-ritz-muted hover:border-ritz-accent/50 hover:text-ritz-text"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {f === "9:16" && "📱 Portrait (TikTok)"}
              {f === "16:9" && "🎬 Paysage (YouTube)"}
              {f === "1:1" && "📸 Carré (Instagram)"}
            </button>
          ))}
        </div>
      </div>

      {/* Number of shots selector */}
      <div>
        <label className="block text-xs font-medium text-ritz-muted mb-2">
          Nombre de plans
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[4, 6, 8].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNumShots(n)}
              disabled={disabled}
              className={`h-11 rounded-xl text-sm font-medium transition-all duration-300 ${
                numShots === n
                  ? "bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg shadow-md shadow-ritz-accent/25 border border-ritz-accent"
                  : "bg-ritz-card border border-ritz-border text-ritz-muted hover:border-ritz-accent/50 hover:text-ritz-text"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {n} plans
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div>
        <label className="block text-xs font-medium text-ritz-muted mb-2">
          Images de reference (optionnel)
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled) {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = "image/*";
              input.onchange = (e) => {
                const t = e.target as HTMLInputElement;
                if (t.files?.length) addFiles(t.files);
              };
              input.click();
            }
          }}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
            dragOver
              ? "border-ritz-accent bg-ritz-accent/10"
              : "border-ritz-border hover:border-ritz-accent/50 bg-ritz-card/50"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-ritz-soft flex items-center justify-center">
              <ImagePlus size={22} className="text-ritz-muted" />
            </div>
            <div>
              <p className="text-sm text-ritz-text">
                Glissez vos images ici
              </p>
              <p className="text-xs text-ritz-muted mt-1">
                PNG, JPG — pour la coherence visuelle
              </p>
            </div>
          </div>
        </div>

        {/* Previews */}
        <AnimatePresence>
          {previews.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-3 mt-4"
            >
              {previews.map((src, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group"
                >
                  <img
                    src={src}
                    alt={`Ref ${i + 1}`}
                    className="w-20 h-20 rounded-xl object-cover border border-ritz-border"
                  />
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-ritz-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={disabled || !theme.trim()}
        className="h-12 w-full bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-xl text-sm font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-ritz-accent/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
      >
        {disabled ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generation en cours...
          </div>
        ) : (
          <>
            <Sparkles size={16} />
            Generer la video
          </>
        )}
      </button>
    </form>
  );
}
