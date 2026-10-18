// Password is read from stdin, never from process arguments. Existing sessions are revoked by the new hash.
import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
const username = process.argv[2];
if (!username || username.length > 128) throw new Error("Usage: set-admin.mjs USERNAME < password-file");
let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (!password || password.length > 1024) throw new Error("Invalid password length");
const dir = join(resolve(process.env.INVISIBLE_DOTS_HOME || join(homedir(), ".invisible-dots")), "config");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const salt = randomBytes(16).toString("hex");
const account = { username, salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
const tmp = join(dir, `web-account.${randomBytes(8).toString("hex")}.tmp`);
writeFileSync(tmp, JSON.stringify(account), { mode: 0o600, flag: "wx" });
renameSync(tmp, join(dir, "web-account.json"));
console.log("Administrator saved; previous sessions revoked.");
