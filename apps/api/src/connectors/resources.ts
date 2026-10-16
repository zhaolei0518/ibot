import { createHash } from "node:crypto";
import { parse } from "yaml";
import {
  ControlPlaneError,
  type ConnectorSource,
  type ConnectorResources,
} from "@invisible-dots/shared";
const fail = () =>
  new ControlPlaneError(
    502,
    "connector_resources_unavailable",
    "Could not import the pinned marketplace resources. Check source availability and try again.",
  );
/** Data-only import. Commands, hooks, rules and scripts are never executed. */
export async function loadConnectorResources(
  source: ConnectorSource,
  fetcher: typeof fetch = fetch,
): Promise<ConnectorResources> {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(source.repo) ||
    !/^[a-f0-9]{40}$/.test(source.ref) ||
    source.skill_paths.length > 100
  )
    throw fail();
  const read = async (path: string) => {
    if (path.includes("..") || !/^[\w./-]+$/.test(path)) throw fail();
    const r = await fetcher(
      `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${path}`,
      { signal: AbortSignal.timeout(20000), redirect: "error" },
    );
    if (!r.ok || Number(r.headers.get("content-length") ?? 0) > 262144)
      throw fail();
    if (!r.body) throw fail();
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw fail();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  };
  try {
    const servers: ConnectorResources["servers"] = [];
    if (source.mcp_path) {
      const raw = JSON.parse(await read(source.mcp_path)) as Record<
        string,
        unknown
      >;
      const entries = raw.mcpServers ?? raw;
      if (!entries || typeof entries !== "object" || Array.isArray(entries))
        throw fail();
      for (const [name, value] of Object.entries(entries)) {
        if (!value || typeof value !== "object") continue;
        const v = value as Record<string, unknown>;
        if (typeof v.url === "string") {
          const u = new URL(v.url);
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            u.search ||
            u.hash
          )
            throw fail();
          servers.push({ name, url: u.href });
        } else if (typeof v.command === "string")
          servers.push({ name, command: v.command });
      }
    }
    const skills: ConnectorResources["skills"] = [];
    let next = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(5, source.skill_paths.length) },
        async () => {
          while (next < source.skill_paths.length) {
            const path = source.skill_paths[next++]!;
            const content = await read(path);
            const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
              content,
            );
            if (!match) throw fail();
            const meta = parse(match[1]!, { maxAliasCount: 0 }) as {
              name?: unknown;
              description?: unknown;
            };
            if (
              !meta ||
              typeof meta.name !== "string" ||
              !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}$/.test(meta.name) ||
              typeof meta.description !== "string" ||
              !meta.description.trim() ||
              meta.description.length > 4096
            )
              throw fail();
            skills.push({
              name: meta.name,
              description: meta.description,
              content,
              path,
              sha256: createHash("sha256").update(content).digest("hex"),
            });
          }
        },
      ),
    );
    if (new Set(skills.map((s) => s.name)).size !== skills.length) throw fail();
    return {
      repo: source.repo,
      ref: source.ref,
      servers,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch {
    throw fail();
  }
}
