import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { hostPaths } from "@invisible-dots/shared/paths";

export const SESSION_COOKIE = "invisible_dots_session";
export const SESSION_SECONDS = 8 * 60 * 60;
const derive = promisify(scrypt);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const configDir = () => hostPaths().configDir;
interface Account { username: string; salt: string; passwordHash: string }
async function account(): Promise<Account | null> {
  try {
    const a = JSON.parse(await readFile(join(configDir(), "web-account.json"), "utf8")) as Account;
    return typeof a.username === "string" && /^[a-f0-9]{32}$/.test(a.salt) && /^[a-f0-9]{128}$/.test(a.passwordHash) ? a : null;
  } catch { return null; }
}
export async function checkPassword(username: string, password: string): Promise<boolean> {
  const a = await account();
  // Derive even for a missing account / wrong username to avoid a fast username oracle.
  const key = await derive(password, a?.salt ?? "00000000000000000000000000000000", 64) as Buffer;
  return !!a && timingSafeEqual(key, Buffer.from(a.passwordHash, "hex")) && a.username === username;
}
export async function createSession(): Promise<string> {
  const a = await account();
  if (!a) throw new Error("Administrator is not initialized");
  const token = randomBytes(32).toString("hex");
  const dir = join(configDir(), "web-sessions");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, digest(token) + ".json"), JSON.stringify({ username: a.username, accountVersion: digest(a.passwordHash), expires: Date.now() + SESSION_SECONDS * 1000 }), { mode: 0o600, flag: "wx" });
  return token;
}
export async function validSession(token: string | undefined): Promise<boolean> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const file = join(configDir(), "web-sessions", digest(token) + ".json");
  try {
    const s = JSON.parse(await readFile(file, "utf8"));
    const a = await account();
    if (a && s.username === a.username && s.accountVersion === digest(a.passwordHash) && typeof s.expires === "number" && s.expires > Date.now()) return true;
    await unlink(file).catch(() => {});
  } catch { /* Invalid and missing sessions fail closed. */ }
  return false;
}
export async function revokeSession(token: string | undefined): Promise<void> {
  if (token && /^[a-f0-9]{64}$/.test(token)) await unlink(join(configDir(), "web-sessions", digest(token) + ".json")).catch(() => {});
}
export function safeReturnPath(path: string | null): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !/[\\\r\n]/.test(path) && !path.startsWith("/login") && !path.startsWith("/auth/") ? path : "/";
}
// Global cap as well as account cap: do not trust client-supplied forwarding headers.
const attempts = new Map<string, { count: number; until: number }>();
export function allowLogin(username: string): boolean {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
  for (const key of ["global", `user:${username.slice(0, 128)}`]) {
    const v = attempts.get(key);
    if (v && v.count >= (key === "global" ? 30 : 10)) return false;
  }
  for (const key of ["global", `user:${username.slice(0, 128)}`]) {
    const v = attempts.get(key) ?? { count: 0, until: now + 5 * 60_000 }; v.count++; attempts.set(key, v);
  }
  return true;
}
