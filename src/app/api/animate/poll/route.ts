import { NextRequest, NextResponse } from "next/server";
import { pollAnimation } from "@/lib/kling";
import { pollFreepikAnimation } from "@/lib/freepik-video";
import { uploadBuffer } from "@/lib/r2";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const projectId = req.nextUrl.searchParams.get("projectId");
    const shotIndex = req.nextUrl.searchParams.get("shotIndex");
    const provider = req.nextUrl.searchParams.get("provider") || "kling";

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    let status: string;
    let videoUrl: string | undefined;

    if (provider === "freepik-pro" || provider === "freepik-std") {
      const result = await pollFreepikAnimation(taskId);
      status = result.status;
      videoUrl = result.videoUrl;
    } else {
      const result = await pollAnimation(taskId);
      status = result.status;
      videoUrl = result.videoUrl;
    }

    // If succeed, download video and store on R2
    if (status === "succeed" && videoUrl && projectId && shotIndex) {
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      const key = `ritz/${projectId}/videos/shot_${shotIndex}.mp4`;
      const r2Url = await uploadBuffer(key, buffer, "video/mp4");
      return NextResponse.json({ status: "succeed", url: r2Url });
    }

    return NextResponse.json({ status }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
