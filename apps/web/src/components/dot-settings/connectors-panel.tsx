"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ConnectorBinding } from "@invisible-dots/shared/browser";
import {
  connectorRequest,
  listBindings,
  listConnectors,
  type ConnectorOverview,
} from "../../lib/connectors";
import { Button } from "../ui/button";
import { Panel } from "./panel";
export function DotConnectors({
  dotId,
  reload,
}: {
  dotId: string;
  reload: () => void;
}) {
  const [data, setData] = useState<ConnectorOverview>();
  const [bindings, setBindings] = useState<ConnectorBinding[]>([]);
  const [accountId, setAccountId] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("ask");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([listConnectors(), listBindings(dotId)]);
      setData(d);
      setBindings(b.bindings);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [dotId]);
  useEffect(() => {
    void load();
  }, [load]);
  const account = data?.accounts.find((a) => a.id === accountId);
  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      await load();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      id="connectors"
      title="Connected accounts"
      description="Choose an account from global Settings and allow specific tools. Changes here apply immediately."
    >
      <Link href="/settings#connectors" className="text-sm underline">
        Manage global connectors ↗
      </Link>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {bindings.length > 0 && (
        <ul className="space-y-2">
          {bindings.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {data?.accounts.find((a) => a.id === b.account_id)?.label ??
                    b.account_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.tools.length} allowed tools ·{" "}
                  {b.confirmation === "ask" ? "Ask before use" : "Allowed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data?.accounts.find((a) => a.id === b.account_id)?.status ??
                    "Unavailable"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    connectorRequest(
                      `dots/${dotId}/connectors/${b.id}`,
                      "DELETE",
                    ),
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {data && !data.bridge_configured && (
        <p className="text-sm text-muted-foreground">
          An administrator must enable the connector bridge before connecting
          this Dot.
        </p>
      )}
      <label className="block space-y-1 text-sm">
        Account
        <select
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setTools([]);
          }}
          disabled={busy}
        >
          <option value="">Select a connected account</option>
          {data?.accounts
            .filter((a) => a.status === "connected")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.plugin_id}
              </option>
            ))}
        </select>
      </label>
      {account && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {tools.length} tools selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setTools(
                  account.tools
                    .filter((t) => t.annotations?.readOnlyHint === true)
                    .map((t) => t.name),
                )
              }
            >
              Read-only tools
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setTools([])}
            >
              Clear
            </Button>
          </div>
          <fieldset className="max-h-64 space-y-2 overflow-auto rounded-md border p-3">
            <legend className="sr-only">Allowed tools</legend>
            {account.tools.map((t) => (
              <label
                key={t.name}
                className="flex cursor-pointer items-start gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={tools.includes(t.name)}
                  onChange={(e) =>
                    setTools((v) =>
                      e.target.checked
                        ? [...v, t.name]
                        : v.filter((n) => n !== t.name),
                    )
                  }
                />
                <span>
                  <span className="font-mono">{t.name}</span>
                  {t.description && (
                    <span className="mt-0.5 block text-muted-foreground">
                      {t.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-sm">
            Approval
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            >
              <option value="ask">Ask before using this connection</option>
              <option value="allow">Allow selected tools</option>
            </select>
          </label>
          <Button
            size="sm"
            disabled={busy || !tools.length || !data?.bridge_configured}
            onClick={() =>
              void act(async () => {
                await connectorRequest(`dots/${dotId}/connectors`, "POST", {
                  account_id: accountId,
                  tools,
                  confirmation,
                });
                setTools([]);
                setAccountId("");
              })
            }
          >
            Connect to this Dot
          </Button>
        </>
      )}
    </Panel>
  );
}
