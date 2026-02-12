import { NextRequest, NextResponse } from "next/server";
import { readJSON } from "@/lib/r2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const project = await readJSON(`ritz/${id}/project.json`);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Also load pipeline state if it exists
    const pipelineState = await readJSON(`ritz/${id}/pipeline-state.json`);

    return NextResponse.json({
      ...project,
      pipelineState,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
