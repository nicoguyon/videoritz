import { NextRequest, NextResponse } from "next/server";
import { createMusic } from "@/lib/suno";

export async function POST(req: NextRequest) {
  try {
    const { prompt, style, title } = await req.json();

    if (!prompt || !style) {
      return NextResponse.json(
        { error: "prompt and style required" },
        { status: 400 }
      );
    }

    const { taskId } = await createMusic(prompt, style, title || "VideoRitz Track");

    return NextResponse.json({ taskId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
