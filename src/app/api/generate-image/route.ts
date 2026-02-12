import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { uploadBuffer } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const { projectId, shotIndex, prompt, refImages, format } = await req.json();

    if (!projectId || shotIndex === undefined || !prompt) {
      return NextResponse.json(
        { error: "projectId, shotIndex, and prompt required" },
        { status: 400 }
      );
    }

    // refImages = [{ base64, mimeType }] (already base64-encoded from client)
    const imageBuffer = await generateImage(prompt, refImages || [], format || "16:9");

    const key = `videoritz/${projectId}/images/shot_${shotIndex}.png`;
    const url = await uploadBuffer(key, imageBuffer, "image/png");

    return NextResponse.json({ url, shotIndex });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
