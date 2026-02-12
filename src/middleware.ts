import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const apiKey = process.env.VIDEORITZ_API_KEY;

  // If no key configured, auth is disabled
  if (!apiKey) return NextResponse.next();

  // Only protect /api/ routes (except /api/health)
  if (!req.nextUrl.pathname.startsWith("/api/") || req.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const provided =
    req.headers.get("x-api-key") ||
    req.nextUrl.searchParams.get("key") ||
    req.cookies.get("videoritz_key")?.value;

  if (provided === apiKey) return NextResponse.next();

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 }
  );
}

export const config = {
  matcher: "/api/:path*",
};
