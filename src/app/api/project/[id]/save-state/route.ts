import { NextRequest, NextResponse } from "next/server";
import { uploadJSON } from "@/lib/r2";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const stateData = await req.json();

    // Save pipeline state to R2
    await uploadJSON(`ritz/${projectId}/pipeline-state.json`, stateData);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
