import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "@invisible-dots/database/testing";
import { Scheduler } from "@invisible-dots/scheduler";
import { FakeDriver } from "@invisible-dots/scheduler/testing";
import { parseDotConfig } from "@invisible-dots/shared";
import { mcpSecretName } from "@invisible-dots/database";
import { ChannelHub } from "@invisible-dots/channels";
import {
  ConnectorManager,
  connectorEndpoint,
  connectorHash,
} from "../src/connectors/manager.js";
import { buildConnectorBridge } from "../src/connectors/bridge.js";
import { buildServer } from "../src/server.js";
import { hostFacts } from "./host-facts.js";

/** Real HTTP JSON-RPC and OAuth fixtures; no provider account or customer data is used. */
describe("global connectors: MCP and OAuth integration", () => {
  let t: TestDatabase;
  let scheduler: Scheduler;
  let upstream: FastifyInstance;
  let bridge: FastifyInstance;
  let api: FastifyInstance;
  let channels: ChannelHub;
  let manager: ConnectorManager;
  let origin: string;
  let challenge = "";
  let acceptedToken = "first-token";
  let refreshes = 0;
  let calls = 0;
  const tools = [
    {
      name: "read_sheet",
      description: "Read a test sheet",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
    { name: "write_sheet", inputSchema: { type: "object" } },
  ];
  beforeAll(async () => {
    upstream = Fastify();
    upstream.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_r, v, done) => done(null, new URLSearchParams(v as string)),
    );
    const resource = () => ({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
    });
    upstream.get("/.well-known/oauth-protected-resource/mcp", resource);
    upstream.get("/.well-known/oauth-protected-resource", resource);
    upstream.get("/.well-known/oauth-authorization-server", () => ({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    }));
    upstream.post("/register", async (r, reply) =>
      reply
        .code(201)
        .send({ ...(r.body as object), client_id: "fixture-client" }),
    );
    upstream.post("/token", async (r, reply) => {
      const p = r.body as URLSearchParams;
      if (p.get("grant_type") === "authorization_code") {
        const got = createHash("sha256")
          .update(p.get("code_verifier") ?? "")
          .digest("base64url");
        if (p.get("code") !== "fixture-code" || got !== challenge)
          return reply.code(400).send({ error: "invalid_grant" });
      } else if (
        p.get("grant_type") === "refresh_token" &&
        p.get("refresh_token") === "fixture-refresh"
      ) {
        refreshes++;
        acceptedToken = "refreshed-token";
      } else return reply.code(400).send({ error: "invalid_grant" });
      return {
        access_token: acceptedToken,
        token_type: "Bearer",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
      };
    });
    upstream.post("/mcp", async (r, reply) => {
      if (r.headers.authorization !== `Bearer ${acceptedToken}`)
        return reply
          .code(401)
          .header(
            "www-authenticate",
            `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
          )
          .send({ error: "unauthorized" });
      const m = r.body as {
        id?: number;
        method: string;
        params?: { name?: string };
      };
      if (m.id === undefined) return reply.code(202).send();
      let result: unknown;
      if (m.method === "initialize")
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
        };
      else if (m.method === "tools/list") result = { tools };
      else if (m.method === "tools/call") {
        calls++;
        result = {
          content: [{ type: "text", text: `Called ${m.params?.name}` }],
          isError: false,
        };
      } else result = {};
      return { jsonrpc: "2.0", id: m.id, result };
    });
    upstream.get("/mcp", async (_r, reply) => reply.code(405).send());
    await upstream.listen({ host: "127.0.0.1", port: 0 });
    origin = `http://127.0.0.1:${(upstream.server.address() as AddressInfo).port}`;
    t = await createTestDatabase();
    scheduler = new Scheduler({ db: t.db, driver: new FakeDriver() });
    for (const name of ["alpha", "beta"])
      await t.db.dots.insert({
        id: `dot_${name}`,
        config: parseDotConfig({
          name,
          model: { provider: "openrouter", id: "test/model" },
        }),
        status: "IDLE",
      });
    manager = new ConnectorManager(scheduler, {
      publicUrl: "http://localhost:3000",
      bridgeUrl: "http://10.0.2.2:8788",
    });
    bridge = buildConnectorBridge(manager);
    await bridge.listen({ host: "127.0.0.1", port: 0 });
    channels = new ChannelHub({ db: t.db, host: scheduler, types: [] });
    api = buildServer({
      scheduler,
      channels,
      connectors: manager,
      doctor: async () => [],
      host: hostFacts("pglite"),
      token: "control-token",
    });
  });
  afterAll(async () => {
    await api?.close();
    await bridge?.close();
    await upstream?.close();
    await channels?.close();
    await scheduler?.close();
    await t?.drop();
  });
  const create = (mode: "oauth" | "token" | "none" = "token") =>
    manager.create({
      plugin_id: "google-sheets",
      label: `Fixture ${mode}`,
      endpoint: `${origin}/mcp`,
      auth_mode: mode,
    });
  it("preinstalls all presets and atomically saves a token with its account", async () => {
    const overview = await manager.overview();
    expect(overview.plugins).toHaveLength(14);
    expect(overview.plugins.every((p) => p.installed)).toBe(true);
    const a = await manager.create({
      plugin_id: "github",
      label: "One-step token",
      auth_mode: "token",
      token: acceptedToken,
      endpoint: `${origin}/mcp`,
    });
    expect(JSON.stringify(a)).not.toContain(acceptedToken);
    const connected = await manager.discover(a.id);
    expect(connected.status).toBe("connected");
    await expect(
      manager.create({
        plugin_id: "github",
        label: "Invalid token",
        auth_mode: "token",
        token: "x\ny",
      }),
    ).rejects.toThrow("valid access token");
  });
  it("requires control-plane authentication and exposes all 14 catalogue entries", async () => {
    expect((await api.inject({ url: "/api/connectors" })).statusCode).toBe(401);
    const r = await api.inject({
      url: "/api/connectors",
      headers: { authorization: "Bearer control-token" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().plugins).toHaveLength(14);
    expect(connectorEndpoint("https://mcp.example/mcp")).toBe(
      "https://mcp.example/mcp",
    );
    expect(() =>
      connectorEndpoint("https://user:secret@example.com/mcp"),
    ).toThrow();
    expect(() =>
      connectorEndpoint("https://example.com/mcp?token=secret"),
    ).toThrow();
    expect(() => connectorEndpoint("http://public.example/mcp")).toThrow();
  });
  it("discovers real tools and keeps tokens encrypted and out of account APIs", async () => {
    const a = await create();
    await manager.credentials(a.id, { token: "first-token" });
    expect((await manager.discover(a.id)).tools.map((t) => t.name)).toEqual([
      "read_sheet",
      "write_sheet",
    ]);
    expect(JSON.stringify(await manager.overview())).not.toContain(
      "first-token",
    );
    const row = (
      await t.db.query<{ value_enc: Uint8Array }>(
        "SELECT value_enc FROM secrets WHERE scope=$1",
        [`connector:${a.id}`],
      )
    ).rows[0]!;
    expect(Buffer.from(row.value_enc).toString()).not.toContain("first-token");
  });
  it("enforces tool allowlists, binding identity and immediate disconnect", async () => {
    const a = await create();
    await manager.credentials(a.id, { token: "first-token" });
    await manager.discover(a.id);
    const b = await manager.bind("dot_alpha", {
      account_id: a.id,
      tools: ["read_sheet"],
      confirmation: "ask",
    });
    const token = (await t.db.secrets.get(
      "dot_alpha",
      mcpSecretName(b.server_name, "Authorization"),
    ))!;
    const invoke = (method: string, params?: unknown, id = b.id) =>
      bridge.inject({
        method: "POST",
        url: `/mcp/${id}`,
        headers: { authorization: token },
        payload: { jsonrpc: "2.0", id: 1, method, params },
      });
    const list = await invoke("tools/list");
    expect(
      list.json().result.tools.map((t: { name: string }) => t.name),
    ).toEqual(["read_sheet"]);
    expect(
      (await scheduler.requireDot("dot_alpha")).config.permissions[
        `mcp.${b.server_name}`
      ],
    ).toBe("ask");
    const before = calls;
    expect(
      (await invoke("tools/call", { name: "write_sheet" })).json().error,
    ).toBeDefined();
    expect(calls).toBe(before);
    expect(
      (await invoke("tools/call", { name: "read_sheet", arguments: {} })).json()
        .result.content[0].text,
    ).toBe("Called read_sheet");
    const other = await manager.bind("dot_beta", {
      account_id: a.id,
      tools: ["read_sheet"],
      confirmation: "allow",
    });
    expect((await invoke("tools/list", undefined, other.id)).statusCode).toBe(
      401,
    );
    await manager.disconnect(a.id);
    expect(
      (await invoke("tools/call", { name: "read_sheet" })).json().error,
    ).toBeDefined();
    expect(await t.db.secrets.get(`connector:${a.id}`, "bearer")).toBeNull();
    await manager.unbind("dot_alpha", b.id);
    expect((await invoke("tools/list")).statusCode).toBe(401);
    expect((await t.db.connectors.calls()).length).toBeGreaterThan(0);
  });
  it("serves the bridge to a real MCP SDK client and survives manager recreation", async () => {
    const a = await create();
    await manager.credentials(a.id, { token: "first-token" });
    await manager.discover(a.id);
    const reopened = new ConnectorManager(scheduler, manager.options);
    expect((await reopened.discover(a.id)).status).toBe("connected");
    const b = await manager.bind("dot_beta", {
      account_id: a.id,
      tools: ["read_sheet"],
      confirmation: "allow",
    });
    const token = (await t.db.secrets.get(
      "dot_beta",
      mcpSecretName(b.server_name, "Authorization"),
    ))!;
    const port = (bridge.server.address() as AddressInfo).port;
    const client = new Client({ name: "bot-fixture", version: "1" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp/${b.id}`),
          { requestInit: { headers: { Authorization: token } } },
        ),
      );
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        "read_sheet",
      ]);
      expect(
        await client.callTool({ name: "read_sheet", arguments: {} }),
      ).toMatchObject({
        content: [{ type: "text", text: "Called read_sheet" }],
      });
    } finally {
      await client.close();
    }
  });
  it("imports pinned Skills and lets a Bot read them without an external account", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      const name = path.split("/").at(-2)!;
      return new Response(
        `---\nname: ${name}\ndescription: A reviewed workflow\n---\nUse the permitted research tools.`,
        { status: 200 },
      );
    };
    const imported = await manager.importResources("firecrawl", fetcher);
    expect(imported.skill_count).toBe(10);
    const a = await manager.create({
      plugin_id: "firecrawl",
      label: "Firecrawl workflows",
      skills_only: true,
    });
    const ready = await manager.discover(a.id);
    expect(ready.auth_mode).toBe("none");
    expect(ready.tools.map((t) => t.name)).toEqual(["idots_read_plugin_skill"]);
    const b = await manager.bind("dot_beta", {
      account_id: a.id,
      tools: ["idots_read_plugin_skill"],
      confirmation: "allow",
    });
    const result = await manager.call(b, "idots_read_plugin_skill", {
      name: "firecrawl-cli",
    });
    expect(JSON.stringify(result)).toContain(
      "Use the permitted research tools.",
    );
    expect(JSON.stringify(result)).toContain(
      "866f30d4dc0b3eca6a05884f6b6db6d914a5967c",
    );
    await expect(
      manager.call(b, "idots_read_plugin_skill", { name: "uninstalled" }),
    ).rejects.toThrow();
    await manager.disconnect(a.id);
    await expect(
      manager.call(b, "idots_read_plugin_skill", { name: "firecrawl-cli" }),
    ).rejects.toThrow();
  });
  it("completes OAuth with real discovery, DCR and PKCE, rejects replay and refreshes tokens", async () => {
    const a = await create("oauth");
    const started = await manager.beginOAuth(a.id);
    expect(started.authorization_url).toBeTruthy();
    const u = new URL(started.authorization_url!);
    challenge = u.searchParams.get("code_challenge")!;
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const state = u.searchParams.get("state")!;
    expect((await manager.completeOAuth(state, "fixture-code")).status).toBe(
      "connected",
    );
    await expect(manager.completeOAuth(state, "fixture-code")).rejects.toThrow(
      /expired|used/,
    );
    acceptedToken = "expired-on-server";
    expect((await manager.discover(a.id)).status).toBe("connected");
    expect(refreshes).toBe(1);
    expect(JSON.stringify(await manager.overview())).not.toContain(
      "fixture-refresh",
    );
    const pending = await manager.create({
      plugin_id: "gitbook",
      label: "Pending",
      endpoint: `${origin}/mcp`,
      auth_mode: "oauth",
    });
    const flow = await manager.beginOAuth(pending.id);
    const oldState = new URL(flow.authorization_url!).searchParams.get(
      "state",
    )!;
    await manager.disconnect(pending.id);
    await expect(
      manager.completeOAuth(oldState, "fixture-code"),
    ).rejects.toThrow();
  });
  it("rejects expired OAuth flows and sanitizes callback failures", async () => {
    const a = await create("oauth");
    const flow = await manager.beginOAuth(a.id);
    const state = new URL(flow.authorization_url!).searchParams.get("state")!;
    await t.db.query(
      "UPDATE connector_oauth_states SET expires_at=now()-interval '1 minute' WHERE state_hash=$1",
      [connectorHash(state)],
    );
    await expect(manager.completeOAuth(state, "fixture-code")).rejects.toThrow(
      /expired/,
    );
    const r = await api.inject({
      url: `/api/connectors/oauth/callback?state=${state}&code=secret-code&error_description=secret-body`,
      headers: { authorization: "Bearer control-token" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toContain("secret-code");
    expect(r.body).not.toContain("secret-body");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
  });
});
