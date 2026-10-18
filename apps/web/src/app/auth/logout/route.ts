import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE } from "../../../lib/web-auth";
export async function POST(request: NextRequest) {
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
