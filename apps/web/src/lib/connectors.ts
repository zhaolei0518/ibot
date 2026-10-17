import type {
  ConnectorAccount,
  ConnectorBinding,
  ConnectorPlugin,
} from "@invisible-dots/shared/browser";
export interface ConnectorOverview {
  plugins: (ConnectorPlugin & {
    installed: boolean;
    resources_imported?: boolean;
    skill_count?: number;
  })[];
  accounts: ConnectorAccount[];
  oauth_configured: boolean;
  bridge_configured: boolean;
}
export async function connectorRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const operation =
    path === "connectors/accounts" && method === "POST"
      ? "Save account"
      : path.endsWith("/discover")
        ? "Discover provider tools"
        : path.endsWith("/authorize")
          ? "Start provider sign-in"
          : path === "connectors"
            ? "Refresh connector accounts"
            : "Update connector";
  // randomUUID is restricted to secure contexts; this UI also supports LAN HTTP.
  // This ID is only for request tracing, never authentication or OAuth state.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  let result: T & { message?: string };
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers: {
        "X-Connector-Request-Id": requestId,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    result = await response.json();
  } catch (error) {
    const timedOut = signal.aborted || (error as Error).name === "TimeoutError";
    throw new Error(
      `${operation}: ${timedOut ? "no response within 30 seconds" : "the request could not be completed"}. ${method} /api/${path}. Reference: ${requestId}. ${path === "connectors/accounts" && method === "POST" ? "Check Accounts before retrying; the save may have completed." : ""}`.trim(),
    );
  }
  if (!response.ok)
    throw new Error(
      `${operation}: ${result.message ?? "The connector request could not be completed."} (HTTP ${response.status}; reference ${requestId})`,
    );
  return result;
}
export const listConnectors = () =>
  connectorRequest<ConnectorOverview>("connectors");
export const listBindings = (id: string) =>
  connectorRequest<{ bindings: ConnectorBinding[] }>(
    `dots/${encodeURIComponent(id)}/connectors`,
  );
