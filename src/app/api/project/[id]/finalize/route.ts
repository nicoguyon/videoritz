import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { uploadBuffer, readJSON, uploadJSON } from "@/lib/r2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Probe a local video file and return its duration in seconds. */
function probeDuration(filePath: string): number {
  try {
    const raw = execSync(
      `ffprobe -v error -print_format json -show_format -show_streams "${filePath}"`,
      { stdio: "pipe", timeout: 15000 }
    ).toString();
    const info = JSON.parse(raw);
    // Prefer format.duration, fall back to first video stream duration
    const dur =
      parseFloat(info?.format?.duration) ||
      parseFloat(
        info?.streams?.find((s: { codec_type?: string }) => s.codec_type === "video")?.duration
      );
    return Number.isFinite(dur) && dur > 0 ? dur : 5;
  } catch {
    return 5; // safe fallback
  }
}

/** Probe a local audio file and return its duration in seconds. */
function probeAudioDuration(filePath: string): number {
  try {
    const raw = execSync(
      `ffprobe -v error -print_format json -show_format "${filePath}"`,
      { stdio: "pipe", timeout: 15000 }
    ).toString();
    const info = JSON.parse(raw);
    const dur = parseFloat(info?.format?.duration);
    return Number.isFinite(dur) && dur > 0 ? dur : 0;
  } catch {
    return 0;
  }
}

/** Resolution map per format. */
function getResolution(format: string): { w: number; h: number } {
  switch (format) {
    case "9:16":
      return { w: 1080, h: 1920 };
    case "1:1":
      return { w: 1080, h: 1080 };
    default:
      return { w: 1920, h: 1080 };
  }
}

/** Transition names to cycle through for visual variety. */
const TRANSITIONS = ["fade", "dissolve", "fadeblack", "fadewhite", "slideleft"] as const;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  let tmpDir: string | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";

    // Mode 1: Client uploaded a blob (fallback)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const videoFile = formData.get("video") as File;

      if (!videoFile) {
        return NextResponse.json({ error: "Video file required" }, { status: 400 });
      }

      const bytes = await videoFile.arrayBuffer();
      const key = `ritz/${projectId}/final.mp4`;
      const url = await uploadBuffer(key, Buffer.from(bytes), "video/mp4");

      const project = await readJSON<Record<string, unknown>>(
        `ritz/${projectId}/project.json`
      );
      if (project) {
        project.status = "finalized";
        project.finalVideoUrl = url;
        await uploadJSON(`ritz/${projectId}/project.json`, project);
      }

      return NextResponse.json({ url, mode: "client" });
    }

    // Mode 2: Server-side montage with FFmpeg
    // Fail fast if FFmpeg is not installed (e.g. Vercel serverless)
    try {
      execSync("which ffmpeg", { stdio: "pipe" });
    } catch {
      return NextResponse.json(
        { error: "ffmpeg_not_available", fallback: "client" },
        { status: 501 }
      );
    }

    // Read shots from pipeline-state.json (most up-to-date source)
    const pipelineState = await readJSON<{
      shots?: Array<{ videoUrl?: string }>;
      musicUrl?: string;
      format?: string;
    }>(`ritz/${projectId}/pipeline-state.json`);

    // Fallback to project.json
    const project = await readJSON<{
      shots?: Array<{ videoUrl?: string }>;
      musicUrl?: string;
      format?: string;
    }>(`ritz/${projectId}/project.json`);

    const shots = pipelineState?.shots || project?.shots;
    const musicUrl = pipelineState?.musicUrl || project?.musicUrl;
    const format = pipelineState?.format || project?.format || "16:9";

    if (!shots) {
      return NextResponse.json(
        { error: "Project not found or no shots" },
        { status: 404 }
      );
    }

    const videoUrls = shots
      .map((s) => s.videoUrl)
      .filter((url): url is string => Boolean(url));

    if (videoUrls.length === 0) {
      return NextResponse.json(
        { error: "No video clips found" },
        { status: 400 }
      );
    }

    // Create temp directory
    tmpDir = mkdtempSync(join(tmpdir(), "videoritz-montage-"));

    // ------------------------------------------------------------------
    // Download all video clips & probe real durations
    // ------------------------------------------------------------------
    const clipPaths: string[] = [];
    const clipDurations: number[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const res = await fetch(videoUrls[i]);
      if (!res.ok) throw new Error(`Failed to download clip ${i}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const clipPath = join(tmpDir, `clip_${i}.mp4`);
      writeFileSync(clipPath, buffer);
      clipPaths.push(clipPath);
      clipDurations.push(probeDuration(clipPath));
    }

    // Download music if available
    let musicPath: string | null = null;
    let musicDuration = 0;
    if (musicUrl) {
      const mRes = await fetch(musicUrl);
      if (mRes.ok) {
        const mBuf = Buffer.from(await mRes.arrayBuffer());
        musicPath = join(tmpDir, "music.mp3");
        writeFileSync(musicPath, mBuf);
        musicDuration = probeAudioDuration(musicPath);
      }
    }

    // ------------------------------------------------------------------
    // Resolution / normalisation settings
    // ------------------------------------------------------------------
    const { w: RES_W, h: RES_H } = getResolution(format);
    const NORM_FILTER = `scale=${RES_W}:${RES_H}:force_original_aspect_ratio=decrease,pad=${RES_W}:${RES_H}:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p`;

    const SHOTS = videoUrls.length;
    const XFADE = 0.7; // crossfade duration between clips
    const INTRO_DUR = 1.5; // black intro
    const OUTRO_DUR = 2.0; // black outro

    // ------------------------------------------------------------------
    // Build FFmpeg command
    // ------------------------------------------------------------------
    const inputs: string[] = [];
    const filterParts: string[] = [];

    // Input 0: black intro
    inputs.push(`-f lavfi -t ${INTRO_DUR} -i "color=c=black:s=${RES_W}x${RES_H}:r=30:d=${INTRO_DUR}"`);

    // Inputs 1..N: video clips
    for (const clipPath of clipPaths) {
      inputs.push(`-i "${clipPath}"`);
    }

    // Input N+1: black outro
    inputs.push(`-f lavfi -t ${OUTRO_DUR} -i "color=c=black:s=${RES_W}x${RES_H}:r=30:d=${OUTRO_DUR}"`);

    // Music input index (if present)
    const musicInputIdx = musicPath ? 1 + SHOTS + 1 : -1;
    if (musicPath) inputs.push(`-i "${musicPath}"`);

    // ------------------------------------------------------------------
    // Normalize all clip streams
    // ------------------------------------------------------------------
    // Intro (index 0) is already correct resolution, just label it
    filterParts.push(`[0:v]setsar=1,format=yuv420p[intro]`);

    // Normalize each clip (indices 1..SHOTS)
    for (let i = 0; i < SHOTS; i++) {
      filterParts.push(`[${i + 1}:v]${NORM_FILTER}[norm${i}]`);
    }

    // Outro (index SHOTS+1) is already correct resolution
    const outroIdx = SHOTS + 1;
    filterParts.push(`[${outroIdx}:v]setsar=1,format=yuv420p[outro]`);

    // ------------------------------------------------------------------
    // Build xfade chain: intro -> clip0 -> clip1 -> ... -> clipN -> outro
    // ------------------------------------------------------------------
    // Running offset tracks where the next xfade begins
    let runningOffset = INTRO_DUR - XFADE; // first xfade: intro->clip0

    if (SHOTS === 1) {
      // intro -> clip0 -> outro
      const t0 = "fade"; // intro transition
      filterParts.push(
        `[intro][norm0]xfade=transition=${t0}:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[tmp0]`
      );
      runningOffset += clipDurations[0] - XFADE;
      filterParts.push(
        `[tmp0][outro]xfade=transition=fade:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[vout]`
      );
      runningOffset += OUTRO_DUR - XFADE;
    } else {
      // intro -> clip0
      filterParts.push(
        `[intro][norm0]xfade=transition=fade:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[xf0]`
      );
      runningOffset += clipDurations[0] - XFADE;

      // clip0 -> clip1 -> ... -> clipN-1
      for (let i = 1; i < SHOTS; i++) {
        const prevLabel = i === 1 ? "[xf0]" : `[xf${i - 1}]`;
        const transition = TRANSITIONS[i % TRANSITIONS.length];

        if (i === SHOTS - 1) {
          // Last clip: merge then go to outro
          filterParts.push(
            `${prevLabel}[norm${i}]xfade=transition=${transition}:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[xf${i}]`
          );
          runningOffset += clipDurations[i] - XFADE;
        } else {
          filterParts.push(
            `${prevLabel}[norm${i}]xfade=transition=${transition}:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[xf${i}]`
          );
          runningOffset += clipDurations[i] - XFADE;
        }
      }

      // last clip -> outro
      filterParts.push(
        `[xf${SHOTS - 1}][outro]xfade=transition=fade:duration=${XFADE}:offset=${runningOffset.toFixed(3)}[vout]`
      );
      runningOffset += OUTRO_DUR - XFADE;
    }

    // Total video duration after all xfades
    const totalDur = runningOffset;

    // ------------------------------------------------------------------
    // Audio filter
    // ------------------------------------------------------------------
    if (musicPath && musicInputIdx >= 0) {
      const AUDIO_FADE_IN = 1.5;
      const AUDIO_FADE_OUT = 2.5;

      if (musicDuration > 0 && musicDuration < totalDur) {
        // Music is shorter than video: loop it then trim
        // aloop loops the entire audio; loop=-1 loops forever, size = samples
        // We loop enough times then trim to totalDur
        const loopCount = Math.ceil(totalDur / musicDuration);
        filterParts.push(
          `[${musicInputIdx}:a]aloop=loop=${loopCount}:size=2147483647,atrim=0:${totalDur.toFixed(3)},afade=t=in:st=0:d=${AUDIO_FADE_IN},afade=t=out:st=${(totalDur - AUDIO_FADE_OUT).toFixed(3)}:d=${AUDIO_FADE_OUT}[aout]`
        );
      } else {
        // Music is longer or equal: just trim + fade
        filterParts.push(
          `[${musicInputIdx}:a]atrim=0:${totalDur.toFixed(3)},afade=t=in:st=0:d=${AUDIO_FADE_IN},afade=t=out:st=${(totalDur - AUDIO_FADE_OUT).toFixed(3)}:d=${AUDIO_FADE_OUT}[aout]`
        );
      }
    }

    // ------------------------------------------------------------------
    // Assemble full FFmpeg command
    // ------------------------------------------------------------------
    const filterComplex = filterParts.join(";\n");
    const outputPath = join(tmpDir, "final.mp4");

    // Write filter to file to avoid shell escaping issues
    const filterPath = join(tmpDir, "filter.txt");
    writeFileSync(filterPath, filterComplex);

    let ffmpegCmd: string;
    if (musicPath && musicInputIdx >= 0) {
      ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex_script "${filterPath}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -shortest "${outputPath}"`;
    } else {
      ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex_script "${filterPath}" -map "[vout]" -c:v libx264 -preset fast -crf 20 -an -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    }

    console.log(`[finalize] FFmpeg montage: ${SHOTS} clips, format=${format}, totalDur=${totalDur.toFixed(1)}s`);
    console.log(`[finalize] Clip durations: ${clipDurations.map((d) => d.toFixed(2)).join(", ")}`);

    execSync(ffmpegCmd, {
      stdio: "pipe",
      timeout: 300000, // 5 min for longer montages
      maxBuffer: 50 * 1024 * 1024, // 50MB stderr buffer
    });

    const finalBuffer = readFileSync(outputPath);
    const url = await uploadBuffer(
      `ritz/${projectId}/final.mp4`,
      finalBuffer,
      "video/mp4"
    );

    // Update project status
    const updatedProject = await readJSON<Record<string, unknown>>(
      `ritz/${projectId}/project.json`
    );
    if (updatedProject) {
      updatedProject.status = "finalized";
      updatedProject.finalVideoUrl = url;
      await uploadJSON(`ritz/${projectId}/project.json`, updatedProject);
    }

    // Cleanup
    if (tmpDir) {
      try {
        rmdirSync(tmpDir, { recursive: true });
      } catch {}
    }

    return NextResponse.json({
      url,
      size: finalBuffer.length,
      duration: +totalDur.toFixed(2),
      clips: SHOTS,
      format,
      mode: "server",
    });
  } catch (err: unknown) {
    if (tmpDir) {
      try {
        rmdirSync(tmpDir, { recursive: true });
      } catch {}
    }
    const message = err instanceof Error ? err.message : "Montage server error";
    console.error("[finalize] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
