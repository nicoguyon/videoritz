import { cleanEnv } from "./env";
const GEMINI_API_KEY = cleanEnv("GEMINI_API_KEY");
const MODEL = "gemini-3-pro-image-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export async function generateImage(
  prompt: string,
  refImages: { base64: string; mimeType: string }[] = [],
  aspectRatio: string = "9:16"
): Promise<Buffer> {
  // Build contents: reference images first, then text prompt
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const ref of refImages) {
    parts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    });
  }

  const textPrefix =
    refImages.length > 0
      ? "Using these reference images for visual consistency (same style, same characters, same atmosphere), create: "
      : "";

  parts.push({ text: textPrefix + prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio },
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const candidates = data.candidates?.[0]?.content?.parts || [];

  for (const part of candidates as GeminiPart[]) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("No image returned from Gemini");
}
