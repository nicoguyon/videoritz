import { NextRequest, NextResponse } from "next/server";
import { createAnimation } from "@/lib/kling";
import { createFreepikAnimation, createFreepikAnimationStd } from "@/lib/freepik-video";
import { downloadBuffer, publicUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const { projectId, shotIndex, prompt } = await req.json();

    if (!projectId || shotIndex === undefined || !prompt) {
      return NextResponse.json(
        { error: "projectId, shotIndex, and prompt required" },
        { status: 400 }
      );
    }

    // Get image key (prefer upscaled)
    let imageKey: string;
    try {
      imageKey = `ritz/${projectId}/upscaled/shot_${shotIndex}.png`;
      await downloadBuffer(imageKey);
    } catch {
      imageKey = `ritz/${projectId}/images/shot_${shotIndex}.png`;
    }

    let taskId: string;
    let provider: "kling" | "freepik-pro" | "freepik-std";

    // Try Kling direct first, then Freepik Pro, then Freepik Standard
    try {
      const buffer = await downloadBuffer(imageKey);
      const base64 = buffer.toString("base64");
      const result = await createAnimation(base64, prompt, 5);
      taskId = result.taskId;
      provider = "kling";
      console.log(`[animate] Shot ${shotIndex}: using Kling direct`);
    } catch (klingErr) {
      console.log(`[animate] Kling failed: ${klingErr instanceof Error ? klingErr.message : klingErr}`);
      
      const imageUrl = publicUrl(imageKey);

      try {
        const result = await createFreepikAnimation(imageUrl, prompt, 5);
        taskId = result.taskId;
        provider = "freepik-pro";
        console.log(`[animate] Shot ${shotIndex}: using Freepik Kling Pro`);
      } catch (proErr) {
        console.log(`[animate] Freepik Pro failed: ${proErr instanceof Error ? proErr.message : proErr}`);
        
        const result = await createFreepikAnimationStd(imageUrl, prompt, 5);
        taskId = result.taskId;
        provider = "freepik-std";
        console.log(`[animate] Shot ${shotIndex}: using Freepik Kling Standard`);
      }
    }

    return NextResponse.json({ taskId, shotIndex, provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
