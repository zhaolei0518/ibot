import { describe, expect, it } from "vitest";
import { loadConnectorResources } from "../src/connectors/resources.js";
const source = {
  repo: "example/plugin",
  ref: "a".repeat(40),
  mcp_path: ".mcp.json",
  skill_paths: ["skills/research/SKILL.md"],
};
describe("pinned marketplace resource import", () => {
  it("imports MCP entries and YAML block descriptions as data without executing hooks or commands", async () => {
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      return new Response(
        url.endsWith(".json")
          ? JSON.stringify({
              mcpServers: {
                remote: { type: "http", url: "https://example.com/mcp" },
                local: { command: "must-not-execute" },
              },
              hooks: { command: "must-not-execute" },
            })
          : "---\nname: research\ndescription: >\n  Research published\n  documentation.\n---\nInstructions.",
      );
    };
    const result = await loadConnectorResources(source, fetcher);
    expect(result.servers).toEqual([
      { name: "remote", url: "https://example.com/mcp" },
      { name: "local", command: "must-not-execute" },
    ]);
    expect(result.skills[0]?.description).toContain(
      "Research published documentation.",
    );
    expect(result.skills[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      requested.every((u) =>
        u.startsWith(
          `https://raw.githubusercontent.com/example/plugin/${source.ref}/`,
        ),
      ),
    ).toBe(true);
  });
  it("accepts the official X plugin's human-readable skill name", async () => {
    const result = await loadConnectorResources(
      { ...source, mcp_path: null },
      async () =>
        new Response(
          "---\nname: X MCP guide\ndescription: X instructions\n---\nRead before use.",
        ),
    );
    expect(result.skills[0]?.name).toBe("X MCP guide");
  });
  it("accepts direct server maps and refuses credential-bearing URLs and oversized resources", async () => {
    const direct = await loadConnectorResources(
      { ...source, skill_paths: [] },
      async () =>
        new Response(
          JSON.stringify({ notion: { url: "https://example.com/mcp" } }),
        ),
    );
    expect(direct.servers[0]?.name).toBe("notion");
    await expect(
      loadConnectorResources(
        { ...source, skill_paths: [] },
        async () =>
          new Response(
            JSON.stringify({
              mcpServers: {
                bad: { url: "https://example.com/mcp?token=secret" },
              },
            }),
          ),
      ),
    ).rejects.toThrow(/Could not import/);
    await expect(
      loadConnectorResources(
        source,
        async () => new Response("x".repeat(262145)),
      ),
    ).rejects.toThrow(/Could not import/);
  });
  it("rejects floating versions and incomplete imports without exposing upstream response bodies", async () => {
    await expect(
      loadConnectorResources({ ...source, ref: "main" }),
    ).rejects.toThrow();
    await expect(
      loadConnectorResources(
        source,
        async () => new Response("private-provider-message", { status: 500 }),
      ),
    ).rejects.toThrow(
      "Could not import the pinned marketplace resources. Check source availability and try again.",
    );
  });
});
