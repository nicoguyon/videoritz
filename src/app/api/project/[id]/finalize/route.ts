import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { uploadBuffer, readJSON, uploadJSON } from "@/lib/r2";

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
      const key = `videoritz/${projectId}/final.mp4`;
      const url = await uploadBuffer(key, Buffer.from(bytes), "video/mp4");

      const project = await readJSON<Record<string, unknown>>(
        `videoritz/${projectId}/project.json`
      );
      if (project) {
        project.status = "finalized";
        project.finalVideoUrl = url;
        await uploadJSON(`videoritz/${projectId}/project.json`, project);
      }

      return NextResponse.json({ url, mode: "client" });
    }

    // Mode 2: Server-side montage with FFmpeg
    // Read shots from pipeline-state.json (most up-to-date source)
    const pipelineState = await readJSON<{
      shots?: Array<{ videoUrl?: string }>;
      musicUrl?: string;
    }>(`videoritz/${projectId}/pipeline-state.json`);

    // Fallback to project.json
    const project = await readJSON<{
      shots?: Array<{ videoUrl?: string }>;
      musicUrl?: string;
    }>(`videoritz/${projectId}/project.json`);

    const shots = pipelineState?.shots || project?.shots;
    const musicUrl = pipelineState?.musicUrl || project?.musicUrl;

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

    // Download all video clips
    const clipPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const res = await fetch(videoUrls[i]);
      if (!res.ok) throw new Error(`Failed to download clip ${i}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const clipPath = join(tmpDir, `clip_${i}.mp4`);
      writeFileSync(clipPath, buffer);
      clipPaths.push(clipPath);
    }

    // Download music if available
    let musicPath: string | null = null;
    if (musicUrl) {
      const mRes = await fetch(musicUrl);
      if (mRes.ok) {
        const mBuf = Buffer.from(await mRes.arrayBuffer());
        musicPath = join(tmpDir, "music.mp3");
        writeFileSync(musicPath, mBuf);
      }
    }

    const SHOTS = videoUrls.length;
    const CLIP_DUR = 5;
    const XFADE = 0.7;
    const totalDur = SHOTS * CLIP_DUR - (SHOTS - 1) * XFADE;

    const inputs: string[] = [];
    for (const clipPath of clipPaths) {
      inputs.push(`-i "${clipPath}"`);
    }
    if (musicPath) inputs.push(`-i "${musicPath}"`);

    const filterParts: string[] = [];

    if (SHOTS === 1) {
      // Single clip: just fade in/out
      filterParts.push("[0:v]fade=t=in:st=0:d=1.2,fade=t=out:st=3.8:d=1.2[vout]");
    } else {
      // Build xfade filter chain
      let prevLabel = "[0:v]";
      for (let i = 1; i < SHOTS; i++) {
        const offset = (CLIP_DUR * i - i * XFADE).toFixed(2);
        const outLabel = i === SHOTS - 1 ? "[vmerged]" : `[v${i}]`;
        filterParts.push(
          `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${outLabel}`
        );
        prevLabel = outLabel;
      }
      filterParts.push(
        `[vmerged]fade=t=in:st=0:d=1.2,fade=t=out:st=${(totalDur - 1.2).toFixed(2)}:d=1.2[vout]`
      );
    }

    if (musicPath) {
      const audioFadeOut = (totalDur - 2).toFixed(2);
      filterParts.push(
        `[${SHOTS}:a]atrim=0:${totalDur.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${audioFadeOut}:d=2[aout]`
      );
    }

    const filterComplex = filterParts.join(";");
    const outputPath = join(tmpDir, "final.mp4");

    let ffmpegCmd: string;
    if (musicPath) {
      ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    } else {
      ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -c:v libx264 -preset fast -crf 20 -an -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    }

    execSync(ffmpegCmd, { stdio: "pipe", timeout: 120000 });

    const finalBuffer = readFileSync(outputPath);
    const url = await uploadBuffer(
      `videoritz/${projectId}/final.mp4`,
      finalBuffer,
      "video/mp4"
    );

    // Update project status
    const updatedProject = await readJSON<Record<string, unknown>>(
      `videoritz/${projectId}/project.json`
    );
    if (updatedProject) {
      updatedProject.status = "finalized";
      updatedProject.finalVideoUrl = url;
      await uploadJSON(`videoritz/${projectId}/project.json`, updatedProject);
    }

    // Cleanup
    if (tmpDir) { try { rmdirSync(tmpDir, { recursive: true }); } catch {} }

    return NextResponse.json({ url, size: finalBuffer.length, mode: "server" });
  } catch (err: unknown) {
    if (tmpDir) {
      try { rmdirSync(tmpDir, { recursive: true }); } catch {}
    }
    const message = err instanceof Error ? err.message : "Montage server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
