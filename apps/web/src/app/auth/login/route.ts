import { NextRequest, NextResponse } from "next/server";
import { allowLogin, checkPassword, createSession, safeReturnPath, SESSION_COOKIE, SESSION_SECONDS } from "../../../lib/web-auth";
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { username, password, next } = body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || username.length > 128 || password.length > 1024) return NextResponse.json({ error: "用户名或密码错误" }, { status: 400 });
  if (!allowLogin(username)) return NextResponse.json({ error: "尝试次数过多，请 5 分钟后重试" }, { status: 429, headers: { "Retry-After": "300" } });
  if (!await checkPassword(username, password)) return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  const response = NextResponse.json({ next: safeReturnPath(typeof next === "string" ? next : null) });
  response.cookies.set(SESSION_COOKIE, await createSession(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
