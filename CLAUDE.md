# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VideoRitz is an automated cinematic video generation pipeline. Users provide a theme and optional reference images, the app generates a storyboard, creates images, upscales them, animates them into video clips, generates music, and assembles everything into a final video with crossfades.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (standalone output)
npm run lint     # ESLint (next core-web-vitals + typescript)
```

## Architecture

### Pipeline Flow

The entire pipeline is orchestrated client-side by `usePipeline` hook, which calls API routes sequentially:

1. **Project Create** (`/api/project/create`) — Upload ref images to R2, create project.json
2. **Storyboard** (`/api/storyboard`) — Claude Sonnet 4.5 generates shots with image/motion/music prompts
3. **Storyboard Review** — User edits/reorders shots in `StoryboardEditor` before proceeding
4. **Per-shot parallel pipeline** (batches of 3):
   - **Image Generation** (`/api/generate-image`) — Gemini 3 Pro generates images
   - **Upscale** (`/api/upscale/create` + `/poll`) — Freepik Magnific Precision v2 (4x)
   - **Animate** (`/api/animate/create` + `/poll`) — Kling v2.5 direct → Freepik Kling Pro → Freepik Kling Std (cascade fallback)
5. **Music** (`/api/music/create` + `/poll`) — Suno v4.5 (runs in parallel with shots)
6. **Montage** (`/api/project/[id]/finalize`) — FFmpeg server-side (xfade transitions, audio mix), falls back to client-side ffmpeg.wasm

### Key Files

| File | Role |
|------|------|
| `src/hooks/usePipeline.ts` | Main pipeline orchestrator (state machine, parallel batching, retry logic) |
| `src/hooks/usePolling.ts` | Generic polling helper for async API tasks |
| `src/lib/claude.ts` | Claude API client (storyboard generation, video analysis) |
| `src/lib/gemini.ts` | Gemini image generation |
| `src/lib/kling.ts` | Kling direct API (JWT auth, image-to-video) |
| `src/lib/freepik.ts` | Freepik upscale (Magnific Precision v2) |
| `src/lib/freepik-video.ts` | Freepik Kling video via MCP JSON-RPC |
| `src/lib/suno.ts` | Suno music generation (sunoapi.org) |
| `src/lib/r2.ts` | Cloudflare R2 storage (upload/download/JSON) |
| `src/lib/ffmpeg-montage.ts` | Client-side ffmpeg.wasm montage (fallback) |
| `src/lib/env.ts` | Env var helper that strips non-printable chars |

### Storage Layout (R2)

All project data is stored under `videoritz/{projectId}/` in Cloudflare R2:
- `project.json` — Project metadata and status
- `pipeline-state.json` — Saved pipeline state for resume
- `storyboard.json` — Generated storyboard
- `refs/ref_N.png` — Reference images
- `images/shot_N.png` — Generated images
- `upscaled/shot_N.png` — Upscaled images
- `videos/shot_N.mp4` — Animated video clips
- `final.mp4` — Final montage

### Animation Provider Cascade

The animate endpoint (`/api/animate/create`) tries providers in order:
1. **Kling direct** — JWT-authenticated, sends base64 image
2. **Freepik Kling Pro** — MCP JSON-RPC, sends image URL
3. **Freepik Kling Std** — cheaper fallback

The poll endpoint needs the `provider` query param to know which API to check.

### Montage Strategy

Server-side finalize (`/api/project/[id]/finalize`) checks for `ffmpeg` binary:
- If present (Railway/Docker): server-side montage with xfade transitions
- If absent (Vercel): returns 501, client falls back to `ffmpeg.wasm`

### Design System

Custom "Ritz" theme defined in `globals.css` using Tailwind v4 `@theme inline`:
- Dark navy palette (`ritz-bg`, `ritz-card`, `ritz-border`, `ritz-soft`)
- Gold accent (`ritz-accent`: `#D4A76A`, `ritz-muted`: `#C8B891`)
- Fonts: Inter (body), Cormorant Garamond (display/headings)

### Pages

- `/` — Main page: project form, pipeline progress, storyboard editor, video preview
- `/projects` — Project gallery listing all R2 projects with resume links

## Deployment

- **Vercel**: Primary deployment. `vercel.json` sets `maxDuration` for long API routes (60s for storyboard/image gen). No FFmpeg available — montage falls back to client.
- **Railway**: Docker-based with FFmpeg. `railway.toml` configures Dockerfile build. Health check at `/api/health`.

## Important Details

- `next.config.ts` sets COOP/COEP headers (required for ffmpeg.wasm SharedArrayBuffer) but excludes `/api/` routes
- `cleanEnv()` strips non-printable characters from env vars (fixes copy-paste issues)
- Kling API requires **raw base64** (no `data:` prefix), while Magnific requires the `data:image/png;base64,` prefix
- Pipeline state is persisted to R2 after each batch, enabling resume via `?resume=projectId`
- Failed shots don't block the pipeline — they're marked and skipped during montage
- `usePolling` implements a generic promise-based polling pattern used by upscale, animate, and music
