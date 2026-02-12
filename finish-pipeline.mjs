#!/usr/bin/env node
// Finish the VideoRitz pipeline for project a2cb62f7
// FFmpeg Ken Burns effect on images + Music + Montage

const PROJECT_ID = "a2cb62f7";
const BASE = "http://localhost:3000";
const SHOTS = 6;
const R2_PUB = "https://pub-536e22068e764b9bafbad4eae700ea0b.r2.dev";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(path, body) {
  const url = `${BASE}${path}`;
  const opts = body
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    : {};
  const res = await fetch(url, opts);
  const data = await res.json();
  if (data.error) throw new Error(`API ${path}: ${data.error}`);
  return data;
}

async function main() {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  console.log("=== VideoRitz Pipeline Finisher ===");
  console.log(`Project: ${PROJECT_ID}`);
  console.log("Using FFmpeg Ken Burns for animations (API credits exhausted)\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "videoritz-"));
  console.log(`Temp dir: ${tmpDir}\n`);

  // Load storyboard
  const storyboardRes = await fetch(
    `${R2_PUB}/videoritz/${PROJECT_ID}/storyboard.json`
  );
  const storyboard = await storyboardRes.json();

  // 1. Download all 6 images
  console.log("--- STEP 1: Download images ---");
  for (let i = 0; i < SHOTS; i++) {
    const url = `${R2_PUB}/videoritz/${PROJECT_ID}/images/shot_${i}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image ${i}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(`${tmpDir}/img_${i}.png`, buf);
    console.log(`  Image ${i}: ${(buf.length / 1024).toFixed(0)}KB — ${storyboard.shots[i].name}`);
  }

  // 2. Generate video clips with Ken Burns effect
  console.log("\n--- STEP 2: Ken Burns animation (FFmpeg) ---");

  // Different motion for each shot for variety
  const kenBurns = [
    // Shot 0: Slow zoom in (meditation close-up)
    { zoom: "min(zoom+0.0015,1.25)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // Shot 1: Pan left to right (arena wide shot)
    { zoom: "1.15", x: "if(eq(on,1),0,x+2)", y: "ih/2-(ih/zoom/2)" },
    // Shot 2: Zoom in + slight up (warriors entering)
    { zoom: "min(zoom+0.0012,1.2)", x: "iw/2-(iw/zoom/2)", y: "max(ih/zoom/2,y-1)" },
    // Shot 3: Slow zoom out from center (salt throw)
    { zoom: "max(zoom-0.001,1.0)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // Shot 4: Zoom in fast (collision impact)
    { zoom: "min(zoom+0.002,1.3)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // Shot 5: Pan right to left + slight zoom (victory)
    { zoom: "min(zoom+0.0008,1.12)", x: "max(0,x-2)", y: "ih/2-(ih/zoom/2)" },
  ];

  const CLIP_DUR = 5;
  const FPS = 30;

  for (let i = 0; i < SHOTS; i++) {
    const kb = kenBurns[i];
    const inputPath = `${tmpDir}/img_${i}.png`;
    const outputPath = `${tmpDir}/clip_${i}.mp4`;

    // zoompan: d = duration in frames, s = output size, fps = frames per second
    const filter = `scale=3840:2160,zoompan=z='${kb.zoom}':x='${kb.x}':y='${kb.y}':d=${CLIP_DUR * FPS}:s=1920x1080:fps=${FPS}`;

    const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filter}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -t ${CLIP_DUR} "${outputPath}"`;

    console.log(`  Rendering shot ${i} (${storyboard.shots[i].name})...`);
    try {
      execSync(cmd, { stdio: "pipe", timeout: 60000 });
      const size = fs.statSync(outputPath).size;
      console.log(`    ✅ ${(size / 1024 / 1024).toFixed(1)}MB`);
    } catch (e) {
      console.error(`    ❌ Error:`, e.stderr?.toString()?.slice(-300));
      throw e;
    }
  }

  // 3. MUSIC
  console.log("\n--- STEP 3: Music (Suno) ---");
  let musicPath = `${tmpDir}/music.mp3`;
  let musicUrl;

  // Check if music exists for this project
  try {
    const musicCheck = await fetch(
      `${R2_PUB}/videoritz/${PROJECT_ID}/music/track.mp3`,
      { method: "HEAD" }
    );
    if (musicCheck.ok) {
      musicUrl = `${R2_PUB}/videoritz/${PROJECT_ID}/music/track.mp3`;
      console.log(`  Music already exists on R2!`);
    }
  } catch {}

  // Check previous project's music as fallback
  if (!musicUrl) {
    try {
      const musicCheck2 = await fetch(
        `${R2_PUB}/videoritz/325d818c/music/track.mp3`,
        { method: "HEAD" }
      );
      if (musicCheck2.ok) {
        musicUrl = `${R2_PUB}/videoritz/325d818c/music/track.mp3`;
        console.log(`  Using music from previous project (325d818c)`);
      }
    } catch {}
  }

  if (!musicUrl) {
    console.log("  Submitting music generation...");
    try {
      const { taskId } = await api("/api/music/create", {
        prompt: storyboard.musicPrompt,
        style: storyboard.musicStyle,
        title: "Sumo Cinematic",
      });
      console.log(`  → Task: ${taskId}`);

      while (!musicUrl) {
        await sleep(10000);
        const data = await api(
          `/api/music/poll?taskId=${taskId}&projectId=${PROJECT_ID}`
        );
        if (data.status === "SUCCESS") {
          musicUrl = data.url;
          console.log(`  ✅ Music ready!`);
        } else if (data.status === "FAILED") {
          throw new Error("Music generation failed");
        } else {
          process.stdout.write(`  ⏳ Music generating...\r`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️ Music failed: ${e.message}`);
      console.log("  Continuing without music...");
    }
  }

  // Download music if available
  if (musicUrl) {
    console.log("  Downloading music...");
    const mRes = await fetch(musicUrl);
    const mBuf = Buffer.from(await mRes.arrayBuffer());
    fs.writeFileSync(musicPath, mBuf);
    console.log(`    ${(mBuf.length / 1024 / 1024).toFixed(1)}MB`);
  }

  // 4. FINAL MONTAGE
  console.log("\n--- STEP 4: Final Montage ---");

  const XFADE = 0.7;
  const totalDur = SHOTS * CLIP_DUR - (SHOTS - 1) * XFADE;
  const hasMusic = musicUrl && fs.existsSync(musicPath);

  const inputs = [];
  for (let i = 0; i < SHOTS; i++) {
    inputs.push(`-i "${tmpDir}/clip_${i}.mp4"`);
  }
  if (hasMusic) inputs.push(`-i "${musicPath}"`);

  // Build xfade filter chain
  const filterParts = [];
  let prevLabel = "[0:v]";
  for (let i = 1; i < SHOTS; i++) {
    const offset = (CLIP_DUR * i - i * XFADE).toFixed(2);
    const outLabel = i === SHOTS - 1 ? "[vmerged]" : `[v${i}]`;
    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${outLabel}`
    );
    prevLabel = outLabel;
  }
  // Fade in/out
  filterParts.push(
    `[vmerged]fade=t=in:st=0:d=1.2,fade=t=out:st=${(totalDur - 1.2).toFixed(2)}:d=1.2[vout]`
  );

  if (hasMusic) {
    const audioFadeOut = (totalDur - 2).toFixed(2);
    filterParts.push(
      `[${SHOTS}:a]atrim=0:${totalDur.toFixed(2)},afade=t=in:st=0:d=1.5,afade=t=out:st=${audioFadeOut}:d=2[aout]`
    );
  }

  const filterComplex = filterParts.join(";");
  const outputPath = `${tmpDir}/final.mp4`;

  let ffmpegCmd;
  if (hasMusic) {
    ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
  } else {
    ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -c:v libx264 -preset fast -crf 20 -an -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
  }

  console.log("  Running FFmpeg montage...");
  try {
    execSync(ffmpegCmd, { stdio: "pipe", timeout: 120000 });
  } catch (e) {
    console.error("  FFmpeg stderr:", e.stderr?.toString()?.slice(-500));
    throw e;
  }

  const finalSize = fs.statSync(outputPath).size;
  console.log(`  ✅ Final video: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Duration: ~${totalDur.toFixed(1)}s`);

  // Copy to desktop
  const desktopPath = path.join(os.homedir(), "Desktop", "videoritz-sumo.mp4");
  fs.copyFileSync(outputPath, desktopPath);
  console.log(`\n🎬 Video saved to: ${desktopPath}`);

  // Open it
  execSync(`open "${desktopPath}"`);
  console.log("🎥 Opening video!");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
