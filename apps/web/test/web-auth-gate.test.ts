import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
describe("authentication boundary", () => {
 it("redirects anonymous pages and rejects anonymous API and forged cookies", async () => {
  const page = await proxy(new NextRequest("http://localhost/dots/my/chat", { headers: { host: "localhost" } }));
  expect(page.status).toBe(307); expect(page.headers.get("location")).toContain("/login?next=");
  for (const path of ["/api/dots", "/api/stream", "/api/event-updates", "/api/dots/my/files"]) {
   const r = await proxy(new NextRequest(`http://localhost${path}`, { headers: { host: "localhost", cookie: "invisible_dots_session=" + "b".repeat(64) } }));
   expect(r.status).toBe(401);
  }
 });
 it("allows login and rejects cross-site or originless writes", async () => {
  expect((await proxy(new NextRequest("http://localhost/login", { headers: { host: "localhost" } }))).status).toBe(200);
  for (const origin of [null, "http://evil.test"]) {
   const r = await proxy(new NextRequest("http://localhost/auth/login", { method: "POST", headers: origin ? { origin, host: "localhost" } : { host: "localhost" } }));
   expect(r.status).toBe(403);
  }
  expect((await proxy(new NextRequest("http://localhost/auth/login", { method: "POST", headers: { origin: "http://localhost", host: "localhost" } }))).status).toBe(200);
 });
});
