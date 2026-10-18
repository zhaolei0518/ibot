import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, validSession } from "./lib/web-auth";
import { checkRequestOrigin } from "./lib/proxy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const refusal = checkRequestOrigin({ method: request.method, host: request.headers.get("host"), origin: request.headers.get("origin"), secFetchSite: request.headers.get("sec-fetch-site") });
  if (refusal || (write && !request.headers.get("origin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const publicPath = path === "/login" || path === "/auth/login";
  if (!publicPath && !await validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (path.startsWith("/api/") || path.startsWith("/auth/")) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = ""; url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
