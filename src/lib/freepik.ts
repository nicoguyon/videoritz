const API_KEY = process.env.FREEPIK_API_KEY!;
const BASE = "https://api.freepik.com/v1/ai/image-upscaler-precision-v2";
const HEADERS = { "x-freepik-api-key": API_KEY };

interface UpscaleCreateResult {
  taskId: string;
}

interface UpscalePollResult {
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  url?: string;
}

export async function createUpscale(
  imageBase64: string
): Promise<UpscaleCreateResult> {
  // Magnific requires data:image/png;base64, prefix
  const prefixed = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  const res = await fetch(BASE, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ image: prefixed, scale: 4 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Magnific create error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return { taskId: data.data.task_id };
}

export async function pollUpscale(
  taskId: string
): Promise<UpscalePollResult> {
  const res = await fetch(`${BASE}/${taskId}`, { headers: HEADERS });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Magnific poll error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const status = data.data?.status;

  if (status === "COMPLETED") {
    return { status, url: data.data.generated[0].url };
  }

  return { status };
}
