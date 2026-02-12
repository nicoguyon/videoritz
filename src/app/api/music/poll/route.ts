import { NextRequest, NextResponse } from "next/server";
import { pollMusic } from "@/lib/suno";
import { uploadBuffer } from "@/lib/r2";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const projectId = req.nextUrl.searchParams.get("projectId");

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const result = await pollMusic(taskId);

    // If success, download and store on R2
    if (result.status === "SUCCESS" && result.audioUrl && projectId) {
      const audioRes = await fetch(result.audioUrl);
      const buffer = Buffer.from(await audioRes.arrayBuffer());
      const key = `videoritz/${projectId}/music/track.mp3`;
      const r2Url = await uploadBuffer(key, buffer, "audio/mpeg");
      return NextResponse.json({
        status: "SUCCESS",
        url: r2Url,
        duration: result.duration,
      });
    }

    return NextResponse.json({ status: result.status }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
