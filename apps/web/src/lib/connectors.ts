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
  const response = await fetch(`/api/${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(
      result.message ?? "The connector request could not be completed.",
    );
  return result;
}
export const listConnectors = () =>
  connectorRequest<ConnectorOverview>("connectors");
export const listBindings = (id: string) =>
  connectorRequest<{ bindings: ConnectorBinding[] }>(
    `dots/${encodeURIComponent(id)}/connectors`,
  );
