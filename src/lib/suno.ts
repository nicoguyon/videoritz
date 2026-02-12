const API_KEY = (process.env.SUNO_API_KEY || "").trim();
const BASE_URL = "https://api.sunoapi.org";
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

interface MusicCreateResult {
  taskId: string;
}

interface MusicPollResult {
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  audioUrl?: string;
  duration?: number;
}

export async function createMusic(
  prompt: string,
  style: string,
  title: string
): Promise<MusicCreateResult> {
  const res = await fetch(`${BASE_URL}/api/v1/generate`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      prompt,
      customMode: true,
      style,
      title,
      instrumental: true,
      model: "V4_5ALL",
      callBackUrl: "https://example.com/callback",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Suno create error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return { taskId: data.data.taskId };
}

export async function pollMusic(
  taskId: string
): Promise<MusicPollResult> {
  const res = await fetch(
    `${BASE_URL}/api/v1/generate/record-info?taskId=${taskId}`,
    { headers: HEADERS }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Suno poll error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const status = data.data?.status;

  if (status === "SUCCESS") {
    const songs = data.data.response?.sunoData || [];
    const song = songs[0];
    return {
      status: "SUCCESS",
      audioUrl: song?.audioUrl,
      duration: song?.duration,
    };
  }

  return { status: status || "PENDING" };
}
