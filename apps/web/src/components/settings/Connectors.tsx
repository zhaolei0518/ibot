"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  PlugIcon,
  RefreshCwIcon,
} from "lucide-react";
import type {
  ConnectorAccount,
  ConnectorPlugin,
} from "@invisible-dots/shared/browser";
import {
  connectorRequest,
  listConnectors,
  type ConnectorOverview,
} from "../../lib/connectors";
import { Section } from "../setup/Section";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const labels: Record<ConnectorAccount["status"], string> = {
  setup: "Needs setup",
  connected: "Connected",
  needs_auth: "Sign-in needed",
  error: "Unavailable",
  disconnected: "Disconnected",
};
export function Connectors() {
  const [data, setData] = useState<ConnectorOverview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ConnectorPlugin>();
  const [tab, setTab] = useState<"catalogue" | "accounts">("catalogue");
  const [authorization, setAuthorization] = useState("");
  const [calls, setCalls] = useState<
    {
      tool_name: string;
      outcome: string;
      duration_ms: number;
      created_at: string;
    }[]
  >();
  const reload = useCallback(async () => {
    try {
      setData(await listConnectors());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setAuthorization("");
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await reload();
    }
  }
  return (
    <Section
      id="connectors"
      title="Connectors"
      description="Connect an account once, then choose which tools each Dot can use."
      action={
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void reload()}
          aria-label="Refresh connectors"
        >
          <RefreshCwIcon className="size-4" />
        </Button>
      }
    >
      <div
        className="flex gap-1 border-b pb-2"
        role="group"
        aria-label="Connector views"
      >
        <Button
          size="sm"
          variant={tab === "catalogue" ? "secondary" : "ghost"}
          aria-pressed={tab === "catalogue"}
          onClick={() => setTab("catalogue")}
        >
          Catalogue <span className="text-muted-foreground">14</span>
        </Button>
        <Button
          size="sm"
          variant={tab === "accounts" ? "secondary" : "ghost"}
          aria-pressed={tab === "accounts"}
          onClick={() => setTab("accounts")}
        >
          Accounts{" "}
          <span className="text-muted-foreground">
            {data?.accounts.length ?? 0}
          </span>
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {authorization && (
        <a
          href={authorization}
          rel="noreferrer"
          className="block rounded-md border p-3 text-sm underline"
        >
          Continue to the provider to authorize this account ↗
        </a>
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading connectors…
        </p>
      )}
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
        >
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <AccountForm
              key={selected.id}
              plugin={selected}
              busy={busy}
              oauthConfigured={data?.oauth_configured ?? false}
              cancel={() => setSelected(undefined)}
              submit={(body) =>
                action(async () => {
                  const account = await connectorRequest<ConnectorAccount>(
                    "connectors/accounts",
                    "POST",
                    body,
                  );
                  setSelected(undefined);
                  setTab("accounts");
                  if ((body as { token?: string }).token)
                    await connectorRequest(
                      `connectors/accounts/${account.id}/discover`,
                      "POST",
                    );
                })
              }
            />
          </DialogContent>
        </Dialog>
      )}
      {tab === "catalogue" && data && (
        <>
          <p className="text-xs text-muted-foreground">
            All 14 connectors are included. Verified service addresses are
            preset; connect an account to enable tools for your Dots.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.plugins.map((p) => (
              <article
                key={p.id}
                className="flex flex-col rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold"
                    style={{ color: p.color }}
                    aria-hidden="true"
                  >
                    {p.name === "Google Sheets" ? "GS" : p.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.kind === "skills"
                        ? "Skills · optional MCP"
                        : "MCP connector"}
                    </p>
                  </div>
                  {p.installed && (
                    <CheckIcon
                      className="size-4 text-emerald-600"
                      aria-label="Installed"
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {p.description}
                </p>
                {!p.marketplace_verified && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Marketplace entry pending verification
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                  <a
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                    href={p.marketplace_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.marketplace_verified
                      ? "Cursor source"
                      : "Browse marketplace"}
                    <ArrowUpRightIcon className="size-3" />
                  </a>
                  {p.source && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          connectorRequest(
                            `connectors/plugins/${p.id}/resources`,
                            "POST",
                          ),
                        )
                      }
                    >
                      {p.resources_imported
                        ? `${p.skill_count} Skills imported`
                        : "Import resources"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setSelected(p);
                    }}
                  >
                    {p.unavailable_reason
                      ? "View setup requirements"
                      : "Add account"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "accounts" && data && (
        <div className="space-y-3">
          {data.accounts.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <PlugIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm">No connected accounts yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a connector from the catalogue to get started.
              </p>
            </div>
          )}
          {data.accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              busy={busy}
              oauthConfigured={data.oauth_configured}
              action={action}
              authorize={async () => {
                const result = await connectorRequest<{
                  authorization_url?: string;
                }>(`connectors/accounts/${a.id}/authorize`, "POST");
                setAuthorization(result.authorization_url ?? "");
              }}
            />
          ))}
          {!data.bridge_configured && (
            <p className="text-xs text-muted-foreground">
              An administrator must enable the connector bridge before accounts
              can be assigned to Dots.
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void action(async () =>
                setCalls(await connectorRequest("connectors/calls")),
              )
            }
          >
            Recent tool calls
          </Button>
          {calls && (
            <ul className="space-y-1 text-xs font-mono">
              {calls.length === 0 && <li>No tool calls recorded.</li>}
              {calls.map((c, i) => (
                <li key={i}>
                  {c.tool_name} · {c.outcome} · {c.duration_ms} ms
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
function AccountForm({
  plugin,
  busy,
  oauthConfigured,
  cancel,
  submit,
}: {
  plugin: ConnectorPlugin;
  busy: boolean;
  oauthConfigured: boolean;
  cancel: () => void;
  submit: (body: unknown) => Promise<void>;
}) {
  const [label, setLabel] = useState(plugin.name);
  const [endpoint, setEndpoint] = useState(plugin.endpoint ?? "");
  const [mode, setMode] = useState<string>(plugin.default_auth ?? "oauth");
  const [token, setToken] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [skillsOnly, setSkillsOnly] = useState(false);
  const blocked = Boolean(plugin.unavailable_reason) && !advanced;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          plugin_id: plugin.id,
          label,
          ...(advanced ? { endpoint } : {}),
          auth_mode: mode,
          skills_only: skillsOnly,
          ...(!skillsOnly && mode === "token" ? { token } : {}),
        });
      }}
    >
      <DialogTitle>Set up {plugin.name}</DialogTitle>
      <DialogDescription>{plugin.setup}</DialogDescription>
      {plugin.unavailable_reason && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {plugin.unavailable_reason}
        </p>
      )}
      {plugin.docs_url && (
        <a
          className="text-xs underline"
          href={plugin.docs_url}
          target="_blank"
          rel="noreferrer"
        >
          Provider setup documentation ↗
        </a>
      )}
      <label className="block space-y-1 text-xs">
        Account name
        <Input
          autoFocus
          value={label}
          maxLength={200}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </label>
      {plugin.kind === "skills" && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={skillsOnly}
            onChange={(e) => setSkillsOnly(e.target.checked)}
          />
          Use imported Skills only (no external MCP account)
        </label>
      )}
      {!skillsOnly && (
        <>
          <button
            type="button"
            className="text-xs underline"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            Advanced service settings
          </button>
          {advanced && (
            <label className="block space-y-1 text-xs">
              MCP endpoint
              <Input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://provider.example/mcp"
                required
              />
            </label>
          )}
          <label className="block space-y-1 text-xs">
            Authentication
            <select
              className={selectClass}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="oauth">OAuth sign-in</option>
              <option value="token">Access token</option>
              <option value="none">No authentication</option>
            </select>
          </label>
        </>
      )}
      {!skillsOnly && mode === "token" && !blocked && (
        <label className="block space-y-1 text-xs">
          Access token
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            maxLength={16000}
          />
        </label>
      )}
      {skillsOnly && (
        <p className="text-xs text-muted-foreground">
          Import resources on the plugin card first. After saving, use Refresh
          tools and bind the Skills reader to a Dot.
        </p>
      )}
      {!skillsOnly && mode === "oauth" && !oauthConfigured && (
        <p className="text-xs text-muted-foreground">
          OAuth needs an administrator-configured public HTTPS URL. You can save
          this account and connect it after setup.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || blocked}>
          {busy ? "Connecting…" : "Save account"}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
function AccountCard({
  account: a,
  busy,
  oauthConfigured,
  action,
  authorize,
}: {
  account: ConnectorAccount;
  busy: boolean;
  oauthConfigured: boolean;
  action: (run: () => Promise<unknown>) => Promise<void>;
  authorize: () => Promise<void>;
}) {
  const [credential, setCredential] = useState("");
  const [clientId, setClientId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  function save(e: FormEvent) {
    e.preventDefault();
    void action(async () => {
      await connectorRequest(
        `connectors/accounts/${a.id}/credentials`,
        "PUT",
        a.auth_mode === "token"
          ? { token: credential }
          : {
              client: {
                client_id: clientId,
                ...(credential ? { client_secret: credential } : {}),
              },
              issuer,
            },
      );
      setCredential("");
      setShowCredentials(false);
    });
  }
  return (
    <article className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{a.label}</h3>
          <p className="text-xs text-muted-foreground">
            {a.plugin_id} · {a.auth_mode} · {a.tools.length} tools
          </p>
        </div>
        <span
          className={`text-xs ${a.status === "connected" ? "text-emerald-600" : "text-muted-foreground"}`}
        >
          {labels[a.status]}
        </span>
      </div>
      <p className="break-all text-xs text-muted-foreground">
        {a.endpoint.startsWith("local:skills/")
          ? "Imported workflow Skills"
          : a.endpoint}
      </p>
      {a.error && <p className="text-xs text-destructive">{a.error}</p>}
      <div className="flex flex-wrap gap-2">
        {a.auth_mode === "oauth" && (
          <Button
            size="sm"
            disabled={busy || !oauthConfigured}
            onClick={() => void action(authorize)}
          >
            Sign in
          </Button>
        )}
        {a.auth_mode !== "none" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setShowCredentials(!showCredentials)}
          >
            {a.auth_mode === "token" ? "Set token" : "OAuth client"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void action(() =>
              connectorRequest(`connectors/accounts/${a.id}/discover`, "POST"),
            )
          }
        >
          Refresh tools
        </Button>
        {a.status !== "disconnected" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void action(() =>
                connectorRequest(
                  `connectors/accounts/${a.id}/connection`,
                  "DELETE",
                ),
              )
            }
          >
            Disconnect
          </Button>
        )}
      </div>
      {showCredentials && (
        <form onSubmit={save} className="space-y-2 rounded-md bg-muted/40 p-3">
          {a.auth_mode === "oauth" && (
            <>
              <p className="text-xs text-muted-foreground">
                Only needed for a pre-registered MCP OAuth client. Otherwise use
                Sign in for automatic registration. Google credentials for a
                self-hosted Workspace service are configured on that service.
              </p>
              <label className="block text-xs">
                OAuth issuer
                <Input
                  type="url"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs">
                Client ID
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          <label className="block text-xs">
            {a.auth_mode === "token"
              ? "Access token"
              : "Client secret (if required)"}
            <Input
              type="password"
              autoComplete="new-password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              required={a.auth_mode === "token"}
            />
          </label>
          <Button size="sm" disabled={busy}>
            Save credential
          </Button>
          <p className="text-xs text-muted-foreground">
            Credentials are encrypted and cannot be read back.
          </p>
        </form>
      )}
      {a.tools.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Available tools ({a.tools.length})
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {a.tools.map((t) => (
              <li key={t.name}>
                <span className="font-mono">{t.name}</span>
                {t.description && (
                  <p className="line-clamp-2 text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
