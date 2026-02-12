import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export async function GET() {
  try {
    // List all folders in videoritz/
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: "videoritz/",
        Delimiter: "/",
      })
    );

    const projects = (result.CommonPrefixes || [])
      .map((prefix) => {
        const projectId = prefix.Prefix?.replace("videoritz/", "").replace("/", "");
        return projectId ? { id: projectId } : null;
      })
      .filter((p): p is { id: string } => p !== null);

    // Fetch project.json for each project to get metadata
    const projectsWithMeta = await Promise.all(
      projects.map(async ({ id }) => {
        try {
          const projectUrl = `${PUBLIC_URL}/videoritz/${id}/project.json`;
          const res = await fetch(projectUrl);
          if (!res.ok) return { id, status: "unknown", theme: "Unknown" };

          const data = await res.json();
          return {
            id,
            theme: data.theme || "Unknown",
            status: data.status || "unknown",
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
