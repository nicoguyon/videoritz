#!/usr/bin/env node
// Finish VideoRitz pipeline for project a2cb62f7
// Kling 3.0 Pro (Freepik REST API) → Music (Suno) → FFmpeg montage

const PROJECT_ID = "a2cb62f7";
const BASE = "http://localhost:3000";
const R2_PUB = "https://pub-536e22068e764b9bafbad4eae700ea0b.r2.dev";
const FREEPIK_KEY = "FPSXa038eccbc145a9c39bc7f0024f602531";
const FREEPIK_BASE = "https://api.freepik.com/v1/ai";
const SHOTS = 6;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Freepik Kling 3.0 Pro REST API ---

async function createKling3(imageUrl, prompt, duration = 5) {
  const res = await fetch(`${FREEPIK_BASE}/video/kling-v3-pro`, {
    method: "POST",
    headers: {
      "x-freepik-api-key": FREEPIK_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_image_url: imageUrl,
      prompt,
      aspect_ratio: "16:9",
      duration: String(duration),
      cfg_scale: 0.5,
      negative_prompt: "blur, distort, low quality, watermark, text overlay, morphing",
      generate_audio: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling 3 create ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data?.task_id || data.data?.id;
}

async function pollKling3(taskId) {
  const res = await fetch(`${FREEPIK_BASE}/video/kling-v3/${taskId}`, {
    headers: { "x-freepik-api-key": FREEPIK_KEY },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling 3 poll ${res.status}: ${err}`);
  }

  const data = await res.json();
  const d = data.data || {};
  const status = d.status;

  // Try multiple possible paths for video URL
  const videoUrl =
    d.video?.url ||
    d.result?.video?.url ||
    d.generated?.[0] ||
    d.output?.url ||
    null;

  return { status, videoUrl };
}

// --- R2 upload ---

async function uploadToR2(key, buffer, contentType) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: "auto",
    endpoint: "https://239fd85bc534649a798bd180f280386e.r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: "e2e8f777a921817807ad65db43f3e373",
      secretAccessKey: "c0a853d3b5df6f78751b49dbdc753a786bf0353074d13f210a8a0b11c02e5b76",
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: "eram",
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `${R2_PUB}/${key}`;
}

// --- Main pipeline ---

async function main() {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  console.log("=== VideoRitz Pipeline — Kling 3.0 Pro ===");
  console.log(`Project: ${PROJECT_ID}\n`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "videoritz-k3-"));
  console.log(`Temp: ${tmpDir}\n`);

  // Load storyboard
  const sbRes = await fetch(`${R2_PUB}/videoritz/${PROJECT_ID}/storyboard.json`);
  const storyboard = await sbRes.json();
  console.log(`Storyboard: ${storyboard.shots.length} shots\n`);

  // --- STEP 1: Animate with Kling 3.0 Pro (batches of 2) ---
  console.log("--- STEP 1: Animate (Kling 3.0 Pro via Freepik) ---\n");

  const videoUrls = {};

  for (let batch = 0; batch < SHOTS; batch += 2) {
    const indices = [batch];
    if (batch + 1 < SHOTS) indices.push(batch + 1);

    console.log(`  Batch ${batch / 2 + 1}: shots ${indices.join(", ")}`);

    // Submit batch
    const tasks = [];
    for (const idx of indices) {
      const imageUrl = `${R2_PUB}/videoritz/${PROJECT_ID}/images/shot_${idx}.png`;
      const prompt = storyboard.shots[idx].motionPrompt;
      console.log(`    Submitting shot ${idx} (${storyboard.shots[idx].name})...`);

      try {
        const taskId = await createKling3(imageUrl, prompt, 5);
        console.log(`    → Task: ${taskId}`);
        tasks.push({ idx, taskId });
      } catch (e) {
        console.error(`    ❌ Failed: ${e.message}`);
        throw e;
      }

      await sleep(500);
    }

    // Poll batch
    console.log(`    Polling...`);
    const done = {};
    let pollCount = 0;

    while (Object.keys(done).length < indices.length) {
      pollCount++;

      for (const { idx, taskId } of tasks) {
        if (done[idx]) continue;

        try {
          const result = await pollKling3(taskId);

          if (result.status === "COMPLETED" && result.videoUrl) {
            done[idx] = result.videoUrl;
            console.log(`    ✅ Shot ${idx} done!`);
          } else if (result.status === "FAILED") {
            throw new Error(`Shot ${idx} FAILED`);
          }
        } catch (e) {
          if (e.message.includes("FAILED")) throw e;
          // Ignore transient poll errors
        }
      }

      if (Object.keys(done).length < indices.length) {
        const elapsed = pollCount * 15;
        process.stdout.write(
          `    ⏳ ${Object.keys(done).length}/${indices.length} (${elapsed}s)...\r`
        );
        await sleep(15000);
      }
    }

    // Download videos and upload to R2
    for (const idx of indices) {
      const videoUrl = done[idx];
      console.log(`    Downloading shot ${idx}...`);
      const vRes = await fetch(videoUrl);
      const buf = Buffer.from(await vRes.arrayBuffer());
      const r2Key = `videoritz/${PROJECT_ID}/videos/shot_${idx}.mp4`;
      const r2Url = await uploadToR2(r2Key, buf, "video/mp4");
      videoUrls[idx] = r2Url;
      console.log(`    → R2: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    }

    console.log(`  Batch ${batch / 2 + 1} complete!\n`);
  }

  console.log("  All 6 animations done!\n");

  // --- STEP 2: Music ---
  console.log("--- STEP 2: Music (Suno) ---");

  let musicUrl;

  // Check existing music
  try {
    const mCheck = await fetch(
      `${R2_PUB}/videoritz/${PROJECT_ID}/music/track.mp3`,
      { method: "HEAD" }
    );
    if (mCheck.ok) {
      musicUrl = `${R2_PUB}/videoritz/${PROJECT_ID}/music/track.mp3`;
      console.log("  Music already exists on R2!\n");
    }
  } catch {}

  // Check previous project's music
  if (!musicUrl) {
    try {
      const mCheck2 = await fetch(
        `${R2_PUB}/videoritz/325d818c/music/track.mp3`,
        { method: "HEAD" }
      );
      if (mCheck2.ok) {
        musicUrl = `${R2_PUB}/videoritz/325d818c/music/track.mp3`;
        console.log("  Using music from previous project\n");
      }
    } catch {}
  }

  // Generate new music
  if (!musicUrl) {
    console.log("  Generating new music...");
    try {
      const mRes = await fetch(`${BASE}/api/music/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: storyboard.musicPrompt,
          style: storyboard.musicStyle,
          title: "Sumo Cinematic",
          projectId: PROJECT_ID,
        }),
      });
      const mData = await mRes.json();
      const musicTaskId = mData.taskId;
      console.log(`  → Task: ${musicTaskId}`);

      while (!musicUrl) {
        await sleep(10000);
        const pRes = await fetch(
          `${BASE}/api/music/poll?taskId=${musicTaskId}&projectId=${PROJECT_ID}`
        );
        const pData = await pRes.json();
        if (pData.status === "SUCCESS") {
          musicUrl = pData.url;
          console.log("  ✅ Music ready!\n");
        } else if (pData.status === "FAILED") {
          throw new Error("Music generation failed");
        } else {
          process.stdout.write("  ⏳ Generating music...\r");
        }
      }
    } catch (e) {
      console.log(`  ⚠️ Music failed: ${e.message}`);
      console.log("  Continuing without music...\n");
    }
  }

  // --- STEP 3: FFmpeg Montage ---
  console.log("--- STEP 3: FFmpeg Montage ---\n");

  // Download clips
  for (let i = 0; i < SHOTS; i++) {
    const url = videoUrls[i] || `${R2_PUB}/videoritz/${PROJECT_ID}/videos/shot_${i}.mp4`;
    console.log(`  Downloading clip ${i}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download clip ${i} failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(`${tmpDir}/clip_${i}.mp4`, buf);
    console.log(`    ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  }

  // Download music
  const hasMusic = !!musicUrl;
  if (hasMusic) {
    console.log("  Downloading music...");
    const mRes = await fetch(musicUrl);
    const mBuf = Buffer.from(await mRes.arrayBuffer());
    fs.writeFileSync(`${tmpDir}/music.mp3`, mBuf);
    console.log(`    ${(mBuf.length / 1024 / 1024).toFixed(1)}MB`);
  }

  // Probe actual clip duration
  let CLIP_DUR = 5;
  try {
    const probe = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${tmpDir}/clip_0.mp4"`,
      { encoding: "utf-8" }
    ).trim();
    CLIP_DUR = Math.round(parseFloat(probe) * 10) / 10;
    console.log(`\n  Detected clip duration: ${CLIP_DUR}s`);
  } catch {}

  const XFADE = 0.7;
  const totalDur = SHOTS * CLIP_DUR - (SHOTS - 1) * XFADE;

  const inputs = [];
  for (let i = 0; i < SHOTS; i++) {
    inputs.push(`-i "${tmpDir}/clip_${i}.mp4"`);
  }
  if (hasMusic) inputs.push(`-i "${tmpDir}/music.mp3"`);

  // xfade filter chain
  const filterParts = [];
  let prevLabel = "[0:v]";
  for (let i = 1; i < SHOTS; i++) {
    const offset = (i * CLIP_DUR - i * XFADE).toFixed(2);
    const outLabel = i < SHOTS - 1 ? `[v${i}]` : "[vmerged]";
    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${outLabel}`
    );
    prevLabel = outLabel;
  }
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
    ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
  } else {
    ffmpegCmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map "[vout]" -c:v libx264 -preset fast -crf 18 -an -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
  }

  console.log("  Running FFmpeg...");
  try {
    execSync(ffmpegCmd, { stdio: "pipe", timeout: 180000 });
  } catch (e) {
    console.error("  FFmpeg error:", e.stderr?.toString()?.slice(-500));
    throw e;
  }

  const finalSize = fs.statSync(outputPath).size;
  console.log(`  ✅ Final video: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Duration: ~${totalDur.toFixed(1)}s`);

  // Upload to R2
  console.log("  Uploading to R2...");
  const finalBuf = fs.readFileSync(outputPath);
  const r2Final = await uploadToR2(
    `videoritz/${PROJECT_ID}/final.mp4`,
    finalBuf,
    "video/mp4"
  );
  console.log(`  → ${r2Final}`);

  // Copy to desktop
  const desktopPath = path.join(os.homedir(), "Desktop", "videoritz-sumo-kling3.mp4");
  fs.copyFileSync(outputPath, desktopPath);
  console.log(`\n🎬 Video: ${desktopPath}`);

  execSync(`open "${desktopPath}"`);
  console.log("🎥 Done!");
}

main().catch((e) => {
  console.error("\n❌ Pipeline failed:", e.message);
  process.exit(1);
});
