import { NextRequest, NextResponse } from "next/server";
import { pollUpscale } from "@/lib/freepik";
import { uploadBuffer } from "@/lib/r2";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const projectId = req.nextUrl.searchParams.get("projectId");
    const shotIndex = req.nextUrl.searchParams.get("shotIndex");

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const result = await pollUpscale(taskId);

    // If completed, download and store on R2
    if (result.status === "COMPLETED" && result.url && projectId && shotIndex) {
      const imageRes = await fetch(result.url);
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const key = `videoritz/${projectId}/upscaled/shot_${shotIndex}.png`;
      const r2Url = await uploadBuffer(key, buffer, "image/png");
      return NextResponse.json({ status: "COMPLETED", url: r2Url });
    }

    return NextResponse.json({ status: result.status }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
