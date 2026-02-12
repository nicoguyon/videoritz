import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { cleanEnv } from "@/lib/env";
import { readJSON } from "@/lib/r2";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${cleanEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: cleanEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: cleanEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const BUCKET = cleanEnv("R2_BUCKET_NAME");

export async function GET() {
  try {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: "ritz/",
        Delimiter: "/",
      })
    );

    const projects = (result.CommonPrefixes || [])
      .map((prefix) => {
        const projectId = prefix.Prefix?.replace("ritz/", "").replace("/", "");
        return projectId ? { id: projectId } : null;
      })
      .filter((p): p is { id: string } => p !== null);

    // Read project.json directly from R2 (no CORS issues, faster)
    const projectsWithMeta = await Promise.all(
      projects.map(async ({ id }) => {
        try {
          const data = await readJSON<Record<string, unknown>>(`ritz/${id}/project.json`);
          if (!data) return { id, status: "unknown", theme: "Unknown" };
          return {
            id,
            theme: (data.theme as string) || "Unknown",
            status: (data.status as string) || "unknown",
            finalVideoUrl: data.finalVideoUrl,
            createdAt: data.createdAt,
          };
        } catch {
          return { id, status: "error", theme: "Error loading project" };
        }
      })
    );

    return NextResponse.json(projectsWithMeta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    // List all objects under this project prefix and delete them
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `ritz/${projectId}/`,
      })
    );

    const keys = (listResult.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete all objects (R2 supports up to 1000 per delete)
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
        },
      })
    );

    return NextResponse.json({ deleted: keys.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
