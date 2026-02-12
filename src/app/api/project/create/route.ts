import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { uploadBuffer, uploadJSON } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const theme = formData.get("theme") as string;
    const files = formData.getAll("refs") as File[];

    if (!theme) {
      return NextResponse.json({ error: "Theme is required" }, { status: 400 });
    }

    const projectId = uuid().slice(0, 8);
    const refUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const bytes = await file.arrayBuffer();
      const key = `ritz/${projectId}/refs/ref_${i}.png`;
      const url = await uploadBuffer(key, Buffer.from(bytes), file.type || "image/png");
      refUrls.push(url);
    }

    const project = {
      id: projectId,
      theme,
      refUrls,
      createdAt: new Date().toISOString(),
      status: "created",
    };

    await uploadJSON(`ritz/${projectId}/project.json`, project);

    return NextResponse.json({ projectId, refUrls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
