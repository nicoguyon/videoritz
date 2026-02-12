import { cleanEnv } from "./env";
const ANTHROPIC_API_KEY = cleanEnv("ANTHROPIC_API_KEY");

interface Shot {
  index: number;
  name: string;
  imagePrompt: string;
  motionPrompt: string;
  musicCue: string;
}

interface StoryboardResult {
  shots: Shot[];
  musicPrompt: string;
  musicStyle: string;
}

interface RefImage {
  base64: string;
  mimeType: string;
}

/**
 * Analyze a reference video description to extract cinematic style for replication.
 */
export async function analyzeReferenceVideo(
  videoDescription: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: `You are a cinematic video analyst. Analyze the described reference video and extract:
1. Visual style (color palette, lighting, contrast, grain/texture)
2. Camera movements (pan, tilt, dolly, crane, tracking, static, Ken Burns)
3. Transitions (fade, crossfade, cut, dissolve, wipe)
4. Pacing and timing (shot duration, rhythm, tempo)
5. Mood and atmosphere (emotional tone, energy level)
6. Composition patterns (framing, depth of field, rule of thirds)

Be specific and detailed. This analysis will be used to guide AI storyboard generation.`,
      messages: [
        {
          role: "user",
          content: `Analyze this reference video for cinematic style replication:\n\n${videoDescription}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude analysis error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

export async function generateStoryboard(
  theme: string,
  refImages: RefImage[] = [],
  numShots = 6,
  videoAnalysis?: string
): Promise<StoryboardResult> {
  const shotDuration = Math.round(30 / numShots);

  const videoContext = videoAnalysis
    ? `\n\nREFERENCE VIDEO ANALYSIS (replicate this cinematic style):\n${videoAnalysis}\n\nUse the exact same visual style, camera movements, transitions, pacing, and mood described above.`
    : "";

  const systemPrompt = `You are a cinematic storyboard director. Given a theme and optional reference images, create exactly ${numShots} shots for a ${30}-second cinematic video (~${shotDuration}s per shot).

For each shot, provide:
1. A name (short, descriptive)
2. An image generation prompt (detailed, for Gemini image AI - describe composition, lighting, camera angle, mood)
3. A motion prompt (for Kling video AI - describe camera movement and subtle animations)
4. A music cue (what the music should feel like at this point)

Also provide a single music generation prompt and style for the full track (instrumental, cinematic).

IMPORTANT RULES:
- PEOPLE AND CHARACTERS: At least 4 out of ${numShots} shots MUST feature human characters prominently (faces, hands, expressions, gestures). Empty scenes without people feel lifeless. Show the protagonist(s), their emotions, their actions. Close-ups of hands doing something, faces reacting, bodies moving. The best cinematic content puts PEOPLE at the center.
- If reference images are provided, ANALYZE them carefully and incorporate their visual style, color palette, lighting, composition, and mood into your image prompts.
- Maintain visual consistency across all shots (same characters, same style, same color palette).
- Describe characters in detail in EVERY shot they appear in (clothing, appearance, position) for AI image consistency.${videoContext}

Respond in valid JSON only, no markdown.`;

  // Build content array with text + images
  const contentBlocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  // Add reference images first so Claude can see them
  for (const img of refImages) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType,
        data: img.base64,
      },
    });
  }

  // Add text prompt
  const textPrompt = refImages.length > 0
    ? `Theme: ${theme}

The images above are reference images provided by the user. Analyze their visual style, color palette, lighting, mood, and composition carefully.

Generate a cinematic storyboard with ${numShots} shots that maintains the visual consistency of these reference images. Return JSON:
{
  "shots": [
    {
      "index": 0,
      "name": "shot_name",
      "imagePrompt": "detailed image generation prompt incorporating reference style...",
      "motionPrompt": "camera/motion description for video animation...",
      "musicCue": "what music does here..."
    }
  ],
  "musicPrompt": "[Intro]\\n(description)\\n\\n[Build]\\n(description)\\n\\n[Crescendo]\\n(description)\\n\\n[Outro]\\n(description)",
  "musicStyle": "Genre, Instruments, Mood descriptors"
}`
    : `Theme: ${theme}

Generate a cinematic storyboard with ${numShots} shots. Return JSON:
{
  "shots": [
    {
      "index": 0,
      "name": "shot_name",
      "imagePrompt": "detailed image generation prompt...",
      "motionPrompt": "camera/motion description for video animation...",
      "musicCue": "what music does here..."
    }
  ],
  "musicPrompt": "[Intro]\\n(description)\\n\\n[Build]\\n(description)\\n\\n[Crescendo]\\n(description)\\n\\n[Outro]\\n(description)",
  "musicStyle": "Genre, Instruments, Mood descriptors"
}`;

  contentBlocks.push({ type: "text", text: textPrompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) {
    throw new Error(`Claude returned no text: ${JSON.stringify(data)}`);
  }

  // Strip markdown code blocks if present
  const cleaned = rawText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as StoryboardResult;
}
