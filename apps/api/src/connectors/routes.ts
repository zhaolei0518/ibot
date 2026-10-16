import type { FastifyInstance } from "fastify";
import { ControlPlaneError } from "@invisible-dots/shared";
import type { ConnectorManager } from "./manager.js";
const body = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new ControlPlaneError(400, "invalid_request", "Give a JSON object.");
  return v as Record<string, unknown>;
};
export function connectorRoutes(
  app: FastifyInstance,
  manager: ConnectorManager,
): void {
  app.get("/api/connectors", () => manager.overview());
  app.get("/api/connectors/calls", () => manager.db.connectors.calls());
  app.post<{ Params: { id: string } }>(
    "/api/connectors/plugins/:id/install",
    (r) => manager.install(r.params.id),
  );
  app.post<{ Params: { id: string } }>(
    "/api/connectors/plugins/:id/resources",
    (r) => manager.importResources(r.params.id),
  );
  app.post("/api/connectors/accounts", (r) => manager.create(body(r.body)));
  app.put<{ Params: { id: string } }>(
    "/api/connectors/accounts/:id/credentials",
    (r) => manager.credentials(r.params.id, body(r.body)),
  );
  app.post<{ Params: { id: string } }>(
    "/api/connectors/accounts/:id/discover",
    (r) => manager.discover(r.params.id),
  );
  app.post<{ Params: { id: string } }>(
    "/api/connectors/accounts/:id/authorize",
    (r) => manager.beginOAuth(r.params.id),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/connectors/accounts/:id/connection",
    (r) => manager.disconnect(r.params.id),
  );
  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>(
    "/api/connectors/oauth/callback",
    async (r, reply) => {
      let success = false;
      try {
        await manager.completeOAuth(
          r.query.state ?? "",
          r.query.code,
          Boolean(r.query.error),
        );
        success = true;
      } catch {
        /* Never log callback URLs, codes or provider error descriptions. */
      }
      return reply
        .code(success ? 200 : 400)
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .header(
          "content-security-policy",
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        )
        .type("text/html; charset=utf-8")
        .send(
          `<!doctype html><html lang="en"><meta charset="utf-8"><title>Connector authorization</title><body><h1>${success ? "Account connected" : "Authorization could not be completed"}</h1><p>${success ? "Return to Settings and refresh the account list." : "Return to Settings, check the account and start authorization again. This login may have expired, been declined, or the MCP service may be unavailable."}</p><a href="/settings#connectors">Return to Settings</a></body></html>`,
        );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/dots/:id/connectors",
    async (r) => ({ bindings: await manager.bindings(r.params.id) }),
  );
  app.post<{ Params: { id: string } }>("/api/dots/:id/connectors", (r) =>
    manager.bind(r.params.id, body(r.body)),
  );
  app.delete<{ Params: { id: string; binding: string } }>(
    "/api/dots/:id/connectors/:binding",
    (r) => manager.unbind(r.params.id, r.params.binding),
  );
}
