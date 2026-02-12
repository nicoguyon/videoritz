import { NextRequest, NextResponse } from "next/server";
import { generateStoryboard, analyzeReferenceVideo } from "@/lib/claude";
import { readJSON, uploadJSON } from "@/lib/r2";

interface RefImage {
  base64: string;
  mimeType: string;
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, theme, refImages, numShots, videoRefDescription } = await req.json();

    if (!projectId || !theme) {
      return NextResponse.json(
        { error: "projectId and theme required" },
        { status: 400 }
      );
    }

    // Analyze reference video if description provided
    let videoAnalysis: string | undefined;
    if (videoRefDescription) {
      videoAnalysis = await analyzeReferenceVideo(videoRefDescription);
    }

    // Pass reference images to Claude (with vision)
    const storyboard = await generateStoryboard(
      theme,
      (refImages as RefImage[]) || [],
      numShots || 6,
      videoAnalysis
    );

    // Save storyboard to R2
    await uploadJSON(`ritz/${projectId}/storyboard.json`, storyboard);

    // Update project
    const project = await readJSON<Record<string, unknown>>(
      `ritz/${projectId}/project.json`
    );
    if (project) {
      project.status = "storyboard";
      project.storyboard = storyboard;
      if (videoAnalysis) project.videoAnalysis = videoAnalysis;
      await uploadJSON(`ritz/${projectId}/project.json`, project);
    }

    return NextResponse.json(storyboard);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
