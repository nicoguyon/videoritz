import { NextRequest, NextResponse } from "next/server";

/**
 * Simple API key auth for VideoRitz.
 * Set VIDEORITZ_API_KEY env var to enable. If not set, auth is disabled (open access).
 *
 * Client sends key via:
 * - Header: x-api-key
 * - Query param: ?key=xxx
 * - Cookie: videoritz_key
 */
export function checkAuth(req: NextRequest): NextResponse | null {
  const apiKey = process.env.VIDEORITZ_API_KEY;

  // If no key configured, auth is disabled
  if (!apiKey) return null;

  const provided =
    req.headers.get("x-api-key") ||
    req.nextUrl.searchParams.get("key") ||
    req.cookies.get("videoritz_key")?.value;

  if (provided === apiKey) return null;

  return NextResponse.json(
    { error: "Unauthorized. Provide API key via x-api-key header." },
    { status: 401 }
  );
}
