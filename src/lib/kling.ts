import jwt from "jsonwebtoken";

const ACCESS_KEY = (process.env.KLING_ACCESS_KEY || "").trim();
const SECRET_KEY = (process.env.KLING_SECRET_KEY || "").trim();
const BASE_URL = "https://api-singapore.klingai.com";

function getJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: ACCESS_KEY, exp: now + 1800, nbf: now - 5 }, SECRET_KEY, {
    algorithm: "HS256",
    header: { alg: "HS256", typ: "JWT" },
  });
}

interface AnimateCreateResult {
  taskId: string;
}

interface AnimatePollResult {
  status: "submitted" | "processing" | "succeed" | "failed";
  videoUrl?: string;
}

export async function createAnimation(
  imageBase64: string,
  prompt: string,
  duration: number = 5
): Promise<AnimateCreateResult> {
  // Kling requires RAW base64, NO data: prefix
  const raw = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  const token = getJwt();
  const res = await fetch(`${BASE_URL}/v1/videos/image2video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "kling-v2-5-turbo",
      image: raw,
      prompt,
      duration: String(duration),
      cfg_scale: 0.5,
      mode: "pro",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling create error ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Kling error ${data.code}: ${data.message}`);
  }

  return { taskId: data.data.task_id };
}

export async function pollAnimation(
  taskId: string
): Promise<AnimatePollResult> {
  const token = getJwt();
  const res = await fetch(
    `${BASE_URL}/v1/videos/image2video/${taskId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling poll error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const task = data.data?.task_result;

  if (task?.videos?.[0]?.url) {
    return { status: "succeed", videoUrl: task.videos[0].url };
  }

  return { status: data.data?.task_status || "processing" };
}
