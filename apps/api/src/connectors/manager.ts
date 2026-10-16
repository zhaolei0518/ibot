import { loadConnectorResources } from "./resources.js";
import { createHash, randomBytes } from "node:crypto";
import { mcpSecretName, type Database } from "@invisible-dots/database";
import type { Scheduler } from "@invisible-dots/scheduler";
import {
  CONNECTOR_CATALOG,
  ControlPlaneError,
  newId,
  parseDotConfig,
  type ConnectorAccount,
  type ConnectorBinding,
  type ConnectorTool,
} from "@invisible-dots/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  auth,
  UnauthorizedError,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformationSchema,
  type OAuthClientInformationMixed,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export const connectorHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const invalid = (message: string) =>
  new ControlPlaneError(400, "invalid_connector", message);
const needsAuth = () =>
  new ControlPlaneError(
    409,
    "connector_auth_required",
    "Connect this account in Settings before using it.",
  );
const scope = (id: string) => `connector:${id}`;
export interface ConnectorOptions {
  publicUrl?: string;
  bridgeUrl?: string;
}

/** No upstream response body or URL is copied into an API error: either can contain a credential. */
function providerError(error: unknown): ControlPlaneError {
  if (error instanceof ControlPlaneError) return error;
  if (
    error instanceof UnauthorizedError ||
    (error as { code?: unknown })?.code === 401
  )
    return needsAuth();
  return new ControlPlaneError(
    502,
    "connector_unavailable",
    "The MCP service could not complete the request. Check its endpoint, account authorization, client registration and service availability.",
  );
}
export function connectorEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw invalid("Enter an MCP endpoint URL.");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw invalid("Enter a valid MCP endpoint URL.");
  }
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  if (
    (u.protocol !== "https:" && !(u.protocol === "http:" && local)) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search
  )
    throw invalid(
      "Use HTTPS, or an explicitly configured local HTTP service. Put credentials in the credential field, not in the URL.",
    );
  return u.href;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw invalid(`${name} must contain 1 to 200 characters.`);
  return value.trim();
}

export class ConnectorManager {
  private readonly locks = new Map<string, Promise<unknown>>();
  readonly db: Database;
  constructor(
    private readonly scheduler: Scheduler,
    readonly options: ConnectorOptions = {},
  ) {
    this.db = scheduler.db;
  }
  private async locked<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(run);
    this.locks.set(key, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
  private async account(id: string): Promise<ConnectorAccount> {
    const a = await this.db.connectors.account(id);
    if (!a)
      throw new ControlPlaneError(
        404,
        "not_found",
        "No such connector account.",
      );
    return a;
  }
  private async get<T>(id: string, name: string): Promise<T | undefined> {
    const v = await this.db.secrets.get(scope(id), name);
    return v === null ? undefined : (JSON.parse(v) as T);
  }
  private put(id: string, name: string, v: unknown): Promise<void> {
    return this.db.secrets.put(scope(id), name, JSON.stringify(v));
  }
  private presets?: Promise<void>;
  async overview() {
    this.presets ??= this.db
      .transaction(async (tx) => {
        for (const plugin of CONNECTOR_CATALOG)
          await tx.connectors.install(plugin.id);
      })
      .catch((error) => {
        this.presets = undefined;
        throw error;
      });
    await this.presets;
    const installed = new Set(await this.db.connectors.installs());
    return {
      plugins: await Promise.all(
        CONNECTOR_CATALOG.map(async (p) => {
          const resources = await this.db.connectors.resources(p.id);
          return {
            ...p,
            installed: installed.has(p.id),
            resources_imported: Boolean(resources),
            skill_count: resources?.skills.length ?? 0,
          };
        }),
      ),
      accounts: await this.db.connectors.accounts(),
      oauth_configured: Boolean(this.options.publicUrl),
      bridge_configured: Boolean(this.options.bridgeUrl),
    };
  }
  async install(id: string) {
    if (!CONNECTOR_CATALOG.some((p) => p.id === id))
      throw invalid("Unknown catalogue plugin.");
    await this.db.connectors.install(id);
    return { installed: true };
  }
  async importResources(id: string, fetcher?: typeof fetch) {
    return this.locked(`resources:${id}`, async () => {
      const plugin = CONNECTOR_CATALOG.find((p) => p.id === id);
      if (!plugin?.source)
        throw invalid(
          "The public source for this plugin has not been verified.",
        );
      const resources = await loadConnectorResources(plugin.source, fetcher);
      await this.db.transaction(async (tx) => {
        await tx.connectors.install(id);
        await tx.connectors.saveResources(id, resources);
      });
      return {
        imported: true,
        ref: resources.ref,
        skill_count: resources.skills.length,
        servers: resources.servers,
      };
    });
  }
  private async skillTool(pluginId: string): Promise<ConnectorTool | null> {
    const resources = await this.db.connectors.resources(pluginId);
    if (!resources?.skills.length) return null;
    return {
      name: "idots_read_plugin_skill",
      description: `Read the imported ${pluginId} workflow instructions before relevant tasks. Scripts and hooks are not installed. Available skills: ${resources.skills.map((s) => `${s.name}: ${s.description.slice(0, 160)}`).join("; ")}`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", enum: resources.skills.map((s) => s.name) },
        },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    };
  }
  async create(body: Record<string, unknown>) {
    const plugin = CONNECTOR_CATALOG.find((p) => p.id === body.plugin_id);
    if (!plugin) throw invalid("Select a catalogue plugin.");
    if (plugin.unavailable_reason && !body.endpoint)
      throw invalid(plugin.unavailable_reason);
    const token =
      typeof body.token === "string"
        ? body.token.trim().replace(/^Bearer\s+/i, "")
        : undefined;
    if (
      body.token !== undefined &&
      (!token || token.length > 16000 || /[\r\n]/.test(token))
    )
      throw invalid("Enter a valid access token.");
    const skillsOnly = plugin.kind === "skills" && body.skills_only === true;
    if (skillsOnly && !(await this.db.connectors.resources(plugin.id)))
      throw invalid("Import this plugin’s resources before using its Skills.");
    const mode = skillsOnly ? "none" : body.auth_mode;
    if (mode !== "oauth" && mode !== "token" && mode !== "none")
      throw invalid("Select OAuth, token or no authentication.");
    const id = newId("conn");
    const a: Pick<
      ConnectorAccount,
      "id" | "plugin_id" | "label" | "endpoint" | "auth_mode"
    > = {
      id,
      plugin_id: plugin.id,
      label: text(body.label, "Account name"),
      endpoint: skillsOnly
        ? `local:skills/${plugin.id}`
        : connectorEndpoint(body.endpoint ?? plugin.endpoint),
      auth_mode: mode,
    };
    await this.db.transaction(async (tx) => {
      await tx.connectors.install(plugin.id);
      await tx.connectors.create(a);
      if (mode === "token" && token)
        await tx.secrets.put(scope(id), "bearer", JSON.stringify(token));
    });
    return this.account(id);
  }
  async credentials(id: string, body: Record<string, unknown>) {
    return this.locked(id, async () => {
      const a = await this.account(id);
      if (a.auth_mode === "token") {
        if (
          typeof body.token !== "string" ||
          !body.token.trim() ||
          body.token.length > 16000 ||
          /[\r\n]/.test(body.token)
        )
          throw invalid("Enter a valid access token.");
        await this.put(
          id,
          "bearer",
          body.token.trim().replace(/^Bearer\s+/i, ""),
        );
      } else if (a.auth_mode === "oauth") {
        const parsed = OAuthClientInformationSchema.safeParse(body.client);
        if (!parsed.success)
          throw invalid(
            "Enter MCP OAuth client information with a client_id, or use the provider's dynamic registration.",
          );
        const issuer =
          typeof body.issuer === "string"
            ? connectorEndpoint(body.issuer)
            : undefined;
        if (!issuer)
          throw invalid(
            "Specify the authorization server issuer for this registered OAuth client.",
          );
        await this.put(id, "client", { ...parsed.data, issuer });
        await this.db.secrets.delete(scope(id), "tokens");
        await this.db.secrets.delete(scope(id), "discovery");
        await this.db.connectors.cancelOAuth(id);
      } else {
        throw invalid("This account does not use credentials.");
      }
      await this.db.connectors.status(id, "setup", []);
      return { configured: true };
    });
  }
  private redirectUrl(): string {
    if (!this.options.publicUrl)
      throw invalid(
        "Set INVISIBLE_DOTS_PUBLIC_URL to the web application's public URL to enable OAuth.",
      );
    const base = new URL(this.options.publicUrl);
    if (
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(base.hostname)
        )) ||
      base.username ||
      base.password
    )
      throw invalid(
        "OAuth requires an HTTPS public URL (or localhost for development).",
      );
    return new URL("/api/connectors/oauth/callback", base).href;
  }
  private provider(
    id: string,
    flow?: {
      state: string;
      verifier?: string;
      redirect?: (url: string) => void;
    },
  ): OAuthClientProvider {
    const store = this;
    return {
      get redirectUrl() {
        return store.redirectUrl();
      },
      get clientMetadata() {
        return {
          client_name: "Invisible Dots",
          redirect_uris: [store.redirectUrl()],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        };
      },
      state: async () => {
        if (!flow) throw needsAuth();
        return flow.state;
      },
      clientInformation: () =>
        store.get<OAuthClientInformationMixed>(id, "client"),
      saveClientInformation: (client) => store.put(id, "client", client),
      tokens: () => store.get<OAuthTokens>(id, "tokens"),
      saveTokens: (tokens) => store.put(id, "tokens", tokens),
      redirectToAuthorization: async (url) => {
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          )
        )
          throw invalid("The authorization server must use HTTPS.");
        if (!flow?.redirect) throw needsAuth();
        flow.redirect(url.href);
      },
      saveCodeVerifier: async (v) => {
        if (!flow) throw needsAuth();
        await store.db.connectors.verifier(connectorHash(flow.state), v);
      },
      codeVerifier: async () => {
        if (!flow?.verifier)
          throw invalid("The OAuth login expired. Start again.");
        return flow.verifier;
      },
      discoveryState: () => store.get<OAuthDiscoveryState>(id, "discovery"),
      saveDiscoveryState: (d) => store.put(id, "discovery", d),
      invalidateCredentials: async (what) => {
        for (const name of what === "all"
          ? ["tokens", "client", "discovery"]
          : what === "tokens"
            ? ["tokens"]
            : what === "client"
              ? ["client"]
              : what === "discovery"
                ? ["discovery"]
                : [])
          await store.db.secrets.delete(scope(id), name);
      },
    };
  }
  private readonly fetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      redirect: "error",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  async beginOAuth(id: string) {
    return this.locked(id, async () => {
      const a = await this.account(id);
      if (a.auth_mode !== "oauth")
        throw invalid("This account does not use OAuth.");
      this.redirectUrl();
      const state = randomBytes(32).toString("base64url");
      await this.db.connectors.beginOAuth(connectorHash(state), id);
      let url: string | undefined;
      try {
        const result = await auth(
          this.provider(id, {
            state,
            redirect: (u) => {
              url = u;
            },
          }),
          { serverUrl: a.endpoint, fetchFn: this.fetch },
        );
        if (result === "AUTHORIZED") {
          await this.db.connectors.cancelOAuth(id);
          return { authorized: true, account: await this.discoverUnlocked(id) };
        }
        if (!url)
          throw invalid("The provider did not return an authorization URL.");
        await this.db.connectors.status(id, "needs_auth", []);
        return { authorization_url: url };
      } catch (e) {
        await this.db.connectors.cancelOAuth(id);
        throw providerError(e);
      }
    });
  }
  async completeOAuth(state: string, code?: string, denied = false) {
    if (!/^[\w-]{43}$/.test(state)) throw invalid("Invalid OAuth state.");
    const hash = connectorHash(state);
    const accountId = await this.db.connectors.oauthAccount(hash);
    if (!accountId)
      throw invalid(
        "This OAuth login expired or was already used. Start again in Settings.",
      );
    return this.locked(accountId, async () => {
      const flow = await this.db.connectors.consumeOAuth(hash);
      if (!flow)
        throw invalid(
          "This OAuth login expired or was already used. Start again in Settings.",
        );
      const a = await this.account(flow.accountId);
      if (a.status === "disconnected") throw needsAuth();
      if (denied || !code || code.length > 8192) {
        await this.db.connectors.status(
          a.id,
          "needs_auth",
          [],
          "Authorization was not completed. Try connecting again.",
        );
        throw needsAuth();
      }
      try {
        const result = await auth(
          this.provider(a.id, { state, verifier: flow.verifier }),
          {
            serverUrl: a.endpoint,
            authorizationCode: code,
            fetchFn: this.fetch,
          },
        );
        if (result !== "AUTHORIZED") throw needsAuth();
        return this.discoverUnlocked(a.id);
      } catch (e) {
        throw providerError(e);
      }
    });
  }
  private async session<T>(
    a: ConnectorAccount,
    run: (client: Client) => Promise<T>,
  ): Promise<T> {
    const bearer =
      a.auth_mode === "token"
        ? await this.get<string>(a.id, "bearer")
        : undefined;
    if (a.auth_mode === "token" && !bearer) throw needsAuth();
    const client = new Client({
      name: "invisible-dots-connectors",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(a.endpoint), {
      fetch: this.fetch,
      ...(a.auth_mode === "oauth" ? { authProvider: this.provider(a.id) } : {}),
      ...(bearer
        ? { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }
        : {}),
    });
    try {
      await client.connect(transport, { timeout: 20000 });
      return await run(client);
    } finally {
      await client.close().catch(() => {});
    }
  }
  discover(id: string) {
    return this.locked(id, () => this.discoverUnlocked(id));
  }
  private async discoverUnlocked(id: string): Promise<ConnectorAccount> {
    const a = await this.account(id);
    try {
      const tools: ConnectorTool[] = a.endpoint.startsWith("local:skills/")
        ? []
        : await this.session(a, async (client) => {
            const all: ConnectorTool[] = [];
            let cursor: string | undefined;
            const seen = new Set<string>();
            let pages = 0;
            do {
              const page = await client.listTools(cursor ? { cursor } : {});
              for (const tool of page.tools)
                all.push({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema,
                  annotations: tool.annotations,
                });
              cursor = page.nextCursor;
              if (++pages > 100 || (cursor && seen.has(cursor)))
                throw invalid("The service returned invalid tool pagination.");
              if (cursor) seen.add(cursor);
              if (all.length > 2000)
                throw invalid("The service returned too many tools.");
            } while (cursor);
            return all;
          });
      const skill = await this.skillTool(a.plugin_id);
      if (skill) {
        if (tools.some((t) => t.name === skill.name))
          throw invalid("The provider uses a reserved tool name.");
        tools.push(skill);
      }
      if (a.endpoint.startsWith("local:skills/") && !skill)
        throw invalid("Import this plugin’s resources first.");
      await this.db.connectors.status(id, "connected", tools);
    } catch (e) {
      const safe = providerError(e);
      await this.db.connectors.status(
        id,
        safe.code === "connector_auth_required" ? "needs_auth" : "error",
        [],
        safe.message,
      );
      throw safe;
    }
    return this.account(id);
  }
  disconnect(id: string) {
    return this.locked(id, async () => {
      await this.account(id);
      await this.db.transaction(async (tx) => {
        await tx.connectors.status(id, "disconnected", []);
        await tx.connectors.cancelOAuth(id);
        await tx.connectors.clearSecrets(id);
      });
      return { disconnected: true };
    });
  }
  async bindings(dot: string) {
    return this.db.connectors.bindings(
      (await this.scheduler.requireDot(dot)).id,
    );
  }
  async bind(dotId: string, body: Record<string, unknown>) {
    const id = text(body.account_id, "Account");
    return this.locked(id, () =>
      this.locked(`dot:${dotId}`, async () => {
        if (!this.options.bridgeUrl)
          throw invalid(
            "Configure INVISIBLE_DOTS_CONNECTOR_BRIDGE_URL and start the bridge listener before binding a Bot.",
          );
        const a = await this.account(id);
        if (a.status !== "connected") throw needsAuth();
        const dot = await this.scheduler.requireDot(dotId);
        if (
          !Array.isArray(body.tools) ||
          body.tools.length === 0 ||
          body.tools.some(
            (t) =>
              typeof t !== "string" || !a.tools.some((tool) => tool.name === t),
          )
        )
          throw invalid(
            "Select at least one tool from this account's current tool list.",
          );
        if (body.confirmation !== "ask" && body.confirmation !== "allow")
          throw invalid(
            "Choose whether this Bot must ask before using this connection.",
          );
        const bindingId = newId("cb");
        const server = `cx-${randomBytes(8).toString("hex")}`;
        const b: ConnectorBinding = {
          id: bindingId,
          account_id: id,
          dot_id: dot.id,
          tools: [...new Set(body.tools as string[])],
          confirmation: body.confirmation,
          server_name: server,
        };
        const token = randomBytes(32).toString("base64url");
        const config = parseDotConfig({
          ...dot.config,
          mcp_servers: {
            ...dot.config.mcp_servers,
            [server]: {
              url: new URL(`/mcp/${bindingId}`, this.options.bridgeUrl).href,
              secrets: ["Authorization"],
            },
          },
          permissions: {
            ...dot.config.permissions,
            [`mcp.${server}`]: b.confirmation,
          },
        });
        const event = await this.db.transaction(async (tx) => {
          const event = await this.scheduler.events.appendHostIn(
            tx,
            dot.id,
            "dot.updated",
            { name: dot.name },
          );
          await tx.connectors.bind(b, connectorHash(token));
          await tx.dots.updateConfig(dot.id, config, dot.config_version);
          await tx.secrets.put(
            dot.id,
            mcpSecretName(server, "Authorization"),
            `Bearer ${token}`,
          );
          return event;
        });
        this.scheduler.events.publish(event);
        await this.scheduler.lifecycle.syncGuest(dot.id).catch(() => {});
        return b;
      }),
    );
  }
  async unbind(dotId: string, bindingId: string) {
    return this.locked(`dot:${dotId}`, async () => {
      const dot = await this.scheduler.requireDot(dotId);
      const b = (await this.db.connectors.bindings(dot.id)).find(
        (b) => b.id === bindingId,
      );
      if (!b)
        throw new ControlPlaneError(
          404,
          "not_found",
          "No such Bot connector binding.",
        );
      const servers = { ...dot.config.mcp_servers };
      delete servers[b.server_name];
      const permissions = { ...dot.config.permissions };
      delete permissions[`mcp.${b.server_name}`];
      const config = parseDotConfig({
        ...dot.config,
        mcp_servers: servers,
        permissions,
      });
      const event = await this.db.transaction(async (tx) => {
        const event = await this.scheduler.events.appendHostIn(
          tx,
          dot.id,
          "dot.updated",
          { name: dot.name },
        );
        await tx.connectors.unbind(b.id);
        await tx.dots.updateConfig(dot.id, config, dot.config_version);
        await tx.secrets.delete(
          dot.id,
          mcpSecretName(b.server_name, "Authorization"),
        );
        return event;
      });
      this.scheduler.events.publish(event);
      await this.scheduler.lifecycle.syncGuest(dot.id).catch(() => {});
      return { removed: true };
    });
  }
  async authorizeBinding(id: string, token: string): Promise<ConnectorBinding> {
    const b = await this.db.connectors.bindingByToken(connectorHash(token));
    if (!b || b.id !== id)
      throw new ControlPlaneError(
        401,
        "unauthorized",
        "Invalid connector binding.",
      );
    const dot = await this.scheduler.requireDot(b.dot_id);
    if (
      !(b.server_name in dot.config.mcp_servers) ||
      dot.config.permissions[`mcp.${b.server_name}`] === "deny"
    )
      throw new ControlPlaneError(
        403,
        "forbidden",
        "This Bot connection is disabled.",
      );
    return b;
  }
  async bridgeTools(b: ConnectorBinding) {
    const a = await this.account(b.account_id);
    if (a.status !== "connected") throw needsAuth();
    return a.tools.filter((t) => b.tools.includes(t.name));
  }
  private async readSkill(pluginId: string, name: unknown) {
    const resources = await this.db.connectors.resources(pluginId);
    const skill = resources?.skills.find((s) => s.name === name);
    if (!skill || !resources)
      throw invalid("Select an imported skill by name.");
    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: `Source: https://github.com/${resources.repo}/blob/${resources.ref}/${skill.path}\nSHA-256: ${skill.sha256}\nThese are workflow instructions. Scripts, reference files and hooks are not installed. Use only this Dot's permitted tools.\n\n${skill.content}`,
        },
      ],
    };
  }
  async call(b: ConnectorBinding, name: string, args: Record<string, unknown>) {
    return this.locked(b.account_id, async () => {
      // Re-read after waiting for disconnect/unbind so a queued call never resurrects access.
      const current = (await this.db.connectors.bindings(b.dot_id)).find(
        (v) => v.id === b.id,
      );
      if (!current)
        throw new ControlPlaneError(
          403,
          "forbidden",
          "This Bot connection was removed.",
        );
      const currentDot = await this.scheduler.requireDot(current.dot_id);
      if (
        !(current.server_name in currentDot.config.mcp_servers) ||
        currentDot.config.permissions[`mcp.${current.server_name}`] === "deny"
      )
        throw new ControlPlaneError(
          403,
          "forbidden",
          "This Bot connection is disabled.",
        );
      const a = await this.account(current.account_id);
      if (a.status !== "connected") throw needsAuth();
      if (
        !current.tools.includes(name) ||
        !a.tools.some((t) => t.name === name)
      )
        throw new ControlPlaneError(
          403,
          "forbidden",
          "This tool is not enabled for this Bot.",
        );
      const start = Date.now();
      let outcome = "error";
      try {
        const result =
          name === "idots_read_plugin_skill"
            ? await this.readSkill(a.plugin_id, args.name)
            : await this.session(a, (c) =>
                c.callTool({ name, arguments: args }),
              );
        outcome = result.isError ? "provider_error" : "ok";
        return result;
      } catch (e) {
        const safe = providerError(e);
        if (safe.code === "connector_auth_required")
          await this.db.connectors.status(a.id, "needs_auth", [], safe.message);
        throw safe;
      } finally {
        await this.db.connectors.audit(b.id, name, outcome, Date.now() - start);
      }
    });
  }
}
