const API_KEY = (process.env.FREEPIK_API_KEY || "").trim();
const MCP_URL = "https://api.freepik.com/mcp";

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: { type: string; text: string }[];
  };
  error?: { code: number; message: string };
}

async function mcpCall(tool: string, args: Record<string, string>): Promise<unknown> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "x-freepik-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: Date.now(),
      params: { name: tool, arguments: args },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Freepik MCP error ${res.status}: ${err}`);
  }

  const data: McpResponse = await res.json();
  if (data.error) {
    throw new Error(`Freepik MCP error ${data.error.code}: ${data.error.message}`);
  }

  const text = data.result?.content?.[0]?.text;
  if (!text) throw new Error("Freepik MCP: no response text");

  return JSON.parse(text);
}

interface VideoCreateResult {
  taskId: string;
}

interface VideoPollResult {
  status: "processing" | "succeed" | "failed";
  videoUrl?: string;
}

/**
 * Create animation via Freepik Kling v2.1 Pro (MCP)
 */
export async function createFreepikAnimation(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<VideoCreateResult> {
  const result = await mcpCall("create_video_kling_2_1_pro", {
    image: imageUrl,
    prompt,
    duration: String(duration >= 10 ? 10 : 5),
    negative_prompt: "fast movement, camera shake, morphing, distortion, blurry hands, watermark, text overlay",
  }) as { data: { task_id: string } };

  return { taskId: result.data.task_id };
}

/**
 * Create animation via Freepik Kling v2.1 Standard (MCP) — cheaper fallback
 */
export async function createFreepikAnimationStd(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<VideoCreateResult> {
  const result = await mcpCall("create_video_kling_2_1_std", {
    image: imageUrl,
    prompt,
    duration: String(duration >= 10 ? 10 : 5),
    negative_prompt: "fast movement, camera shake, morphing, distortion, blurry hands, watermark, text overlay",
  }) as { data: { task_id: string } };

  return { taskId: result.data.task_id };
}

/**
 * Poll Freepik Kling task status (MCP)
 */
export async function pollFreepikAnimation(
  taskId: string
): Promise<VideoPollResult> {
  const result = await mcpCall("get_kling_2_1_task_status", {
    "task-id": taskId,
  }) as { data: { status: string; generated: string[] } };

  const status = result.data.status;

  if (status === "COMPLETED" && result.data.generated?.length > 0) {
    return { status: "succeed", videoUrl: result.data.generated[0] };
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return { status: "failed" };
  }

  return { status: "processing" };
}
