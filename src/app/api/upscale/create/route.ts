import { NextRequest, NextResponse } from "next/server";
import { createUpscale } from "@/lib/freepik";
import { downloadBuffer } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const { projectId, shotIndex } = await req.json();

    if (!projectId || shotIndex === undefined) {
      return NextResponse.json(
        { error: "projectId and shotIndex required" },
        { status: 400 }
      );
    }

    // Download image from R2 and convert to base64
    const key = `ritz/${projectId}/images/shot_${shotIndex}.png`;
    const buffer = await downloadBuffer(key);
    const base64 = buffer.toString("base64");

    const { taskId } = await createUpscale(base64);

    return NextResponse.json({ taskId, shotIndex });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
