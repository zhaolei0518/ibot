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
  const requestId = crypto.randomUUID();
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
