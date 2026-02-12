"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Film, Folder, ExternalLink, Play, Calendar, Image as ImageIcon, Clock, Hash } from "lucide-react";
import Link from "next/link";

interface Project {
  id: string;
  theme: string;
  status: string;
  finalVideoUrl?: string;
  createdAt?: string;
  numShots?: number;
  format?: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        // Sort by creation date (most recent first)
        const sorted = (data as Project[]).sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setProjects(sorted);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "finalized":
      case "done":
        return "text-ritz-success bg-ritz-success/10";
      case "error":
        return "text-ritz-error bg-ritz-error/10";
      case "generating":
      case "upscaling":
      case "animating":
      case "music":
      case "montage":
        return "text-ritz-accent bg-ritz-accent/10";
      default:
        return "text-ritz-muted bg-ritz-soft";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "finalized":
      case "done":
        return "Termine";
      case "error":
        return "Erreur";
      case "storyboard":
      case "storyboard-review":
        return "Storyboard";
      case "generating":
        return "Generation";
      case "upscaling":
        return "Upscale";
      case "animating":
        return "Animation";
      case "music":
        return "Musique";
      case "montage":
        return "Montage";
      case "created":
        return "Cree";
      default:
        return status;
    }
  };

  const getFormatLabel = (format?: string) => {
    switch (format) {
      case "9:16": return "Portrait";
      case "1:1": return "Carre";
      case "16:9": return "Paysage";
      default: return null;
    }
  };

  const completedCount = projects.filter((p) => p.status === "finalized" || p.status === "done").length;
  const inProgressCount = projects.filter((p) => !["finalized", "done", "error", "created"].includes(p.status)).length;

  return (
    <main className="min-h-screen bg-ritz-bg text-ritz-text font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-ritz-border bg-ritz-bg/95 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-4 hover:opacity-90 transition-opacity"
            >
              <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-ritz-accent to-ritz-accent-hover shadow-lg shadow-ritz-accent/25">
                <Film size={20} className="text-ritz-bg" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-xl font-display font-semibold tracking-wide text-ritz-accent">VideoRitz</h1>
                <p className="text-[11px] text-ritz-muted/80 font-light">Mes Projets</p>
              </div>
            </Link>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-lg hover:shadow-lg hover:shadow-ritz-accent/30 transition-all"
          >
            <Film size={13} />
            Nouveau projet
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-3xl font-display font-semibold text-ritz-accent mb-3">Mes Projets</h2>
          <p className="text-sm text-ritz-muted/90">
            Retrouvez tous vos projets VideoRitz ici
          </p>

          {/* Stats bar */}
          {projects.length > 0 && (
            <div className="flex gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-ritz-card border border-ritz-border rounded-lg text-xs">
                <Hash size={12} className="text-ritz-muted" />
                <span className="text-ritz-muted">{projects.length} projets</span>
              </div>
              {completedCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-ritz-success/10 border border-ritz-success/20 rounded-lg text-xs">
                  <Film size={12} className="text-ritz-success" />
                  <span className="text-ritz-success">{completedCount} termines</span>
                </div>
              )}
              {inProgressCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-ritz-accent/10 border border-ritz-accent/20 rounded-lg text-xs">
                  <Clock size={12} className="text-ritz-accent" />
                  <span className="text-ritz-accent">{inProgressCount} en cours</span>
                </div>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-ritz-muted">
              <div className="w-5 h-5 border-2 border-ritz-accent/30 border-t-ritz-accent rounded-full animate-spin" />
              Chargement des projets...
            </div>
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 space-y-4"
          >
            <Folder size={48} className="mx-auto text-ritz-muted opacity-50" />
            <div>
              <h3 className="text-lg font-semibold mb-2">Aucun projet</h3>
              <p className="text-sm text-ritz-muted max-w-md mx-auto">
                Creez votre premier projet pour commencer a generer des videos
                cinematiques
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-ritz-accent/30 transition-all"
            >
              <Film size={16} />
              Nouveau projet
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-ritz-card border border-ritz-border rounded-2xl hover:border-ritz-accent/50 transition-all group overflow-hidden"
              >
                {/* Thumbnail area */}
                {project.finalVideoUrl ? (
                  <div className="aspect-video bg-ritz-soft relative overflow-hidden">
                    <video
                      src={project.finalVideoUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 right-2">
                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Play size={14} className="text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-ritz-soft flex items-center justify-center">
                    <ImageIcon size={32} className="text-ritz-muted/30" />
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate mb-1">
                        {project.theme}
                      </h3>
                      <p className="text-xs text-ritz-muted font-mono">
                        {project.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${getStatusColor(project.status)}`}
                    >
                      {getStatusLabel(project.status)}
                    </span>
                    {project.format && getFormatLabel(project.format) && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ritz-soft text-ritz-muted">
                        {getFormatLabel(project.format)}
                      </span>
                    )}
                    {project.createdAt && (
                      <div className="flex items-center gap-1 text-[10px] text-ritz-muted/60">
                        <Calendar size={10} />
                        {new Date(project.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {project.finalVideoUrl && (
                      <a
                        href={project.finalVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-ritz-accent to-ritz-accent-hover text-ritz-bg rounded-lg text-xs font-semibold hover:shadow-lg hover:shadow-ritz-accent/30 transition-all"
                      >
                        <Play size={12} />
                        Voir
                      </a>
                    )}
                    <Link
                      href={`/?resume=${project.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-ritz-soft hover:bg-ritz-border text-ritz-text rounded-lg text-xs font-semibold transition-all"
                    >
                      <ExternalLink size={12} />
                      Reprendre
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-ritz-accent/8 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-ritz-soft/30 blur-[180px] rounded-full" />
      </div>
    </main>
  );
}
