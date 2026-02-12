import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  return ffmpeg;
}

export async function assembleMontage(
  videoUrls: string[],
  musicUrl: string,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();

  ff.on("progress", ({ progress }) => {
    onProgress?.(Math.round(progress * 100));
  });

  // Download all clips
  for (let i = 0; i < videoUrls.length; i++) {
    const data = await fetchFile(videoUrls[i]);
    await ff.writeFile(`clip_${i}.mp4`, data);
    onProgress?.(Math.round(((i + 1) / (videoUrls.length + 1)) * 30));
  }

  // Download music
  const musicData = await fetchFile(musicUrl);
  await ff.writeFile("music.mp3", musicData);
  onProgress?.(35);

  const N = videoUrls.length;
  const CLIP_DUR = 5; // Each Kling clip is ~5s
  const XFADE = 0.7;

  // Simple concat with xfade approach:
  // For 6 clips: chain xfades progressively
  if (N === 1) {
    // Single clip, just add music
    await ff.exec([
      "-i", "clip_0.mp4",
      "-i", "music.mp3",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      "output.mp4",
    ]);
  } else {
    // Build xfade filter chain
    const inputs: string[] = [];
    for (let i = 0; i < N; i++) {
      inputs.push("-i", `clip_${i}.mp4`);
    }
    inputs.push("-i", "music.mp3");

    // Calculate total duration: sum(durations) - (N-1) * XFADE
    const totalDur = N * CLIP_DUR - (N - 1) * XFADE;

    // Build xfade chain
    let filterParts: string[] = [];
    let prevLabel = "[0:v]";

    for (let i = 1; i < N; i++) {
      const offset = (CLIP_DUR * i - i * XFADE).toFixed(2);
      const outLabel = i === N - 1 ? "[vmerged]" : `[v${i}]`;
      filterParts.push(
        `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${outLabel}`
      );
      prevLabel = outLabel;
    }

    // Add fade in/out on video
    filterParts.push(
      `[vmerged]fade=t=in:st=0:d=1.2,fade=t=out:st=${(totalDur - 1.2).toFixed(2)}:d=1.2[vout]`
    );

    // Audio: trim + fade
    const audioFadeOut = (totalDur - 2).toFixed(2);
    filterParts.push(
      `[${N}:a]atrim=0:${totalDur.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${audioFadeOut}:d=2[aout]`
    );

    const filterComplex = filterParts.join(";");

    await ff.exec([
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "output.mp4",
    ]);
  }

  onProgress?.(95);

  const data = await ff.readFile("output.mp4");
  const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < N; i++) {
    await ff.deleteFile(`clip_${i}.mp4`);
  }
  await ff.deleteFile("music.mp3");
  await ff.deleteFile("output.mp4");

  onProgress?.(100);
  return blob;
}
