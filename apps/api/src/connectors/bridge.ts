import Fastify from "fastify";
import { ControlPlaneError } from "@invisible-dots/shared";
import type { ConnectorManager } from "./manager.js";
/** Stateless MCP endpoint. Each binding has its own high-entropy bearer credential. */
export function buildConnectorBridge(manager: ConnectorManager) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  app.post<{ Params: { id: string } }>("/mcp/:id", async (r, reply) => {
    reply.header("cache-control", "no-store");
    const match = /^Bearer ([\w-]{43})$/.exec(r.headers.authorization ?? "");
    if (!match) return reply.code(401).send({ error: "unauthorized" });
    let binding;
    try {
      binding = await manager.authorizeBinding(r.params.id, match[1]!);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const msg = r.body as
      | { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
      | undefined;
    if (
      !msg ||
      Array.isArray(msg) ||
      msg.jsonrpc !== "2.0" ||
      typeof msg.method !== "string" ||
      !(
        msg.id === undefined ||
        typeof msg.id === "string" ||
        typeof msg.id === "number"
      )
    )
      return reply.code(400).send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid request" },
      });
    if (msg.id === undefined) return reply.code(202).send();
    const id = msg.id;
    const params =
      msg.params && typeof msg.params === "object" && !Array.isArray(msg.params)
        ? (msg.params as Record<string, unknown>)
        : {};
    try {
      let result: unknown;
      switch (msg.method) {
        case "initialize":
          result = {
            protocolVersion: [
              "2024-11-05",
              "2025-03-26",
              "2025-06-18",
              "2025-11-25",
            ].includes(String(params.protocolVersion))
              ? params.protocolVersion
              : "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: {
              name: "invisible-dots-connector-bridge",
              version: "1.0.0",
            },
          };
          break;
        case "ping":
          result = {};
          break;
        case "tools/list":
          result = { tools: await manager.bridgeTools(binding) };
          break;
        case "tools/call": {
          if (
            typeof params.name !== "string" ||
            (params.arguments !== undefined &&
              (!params.arguments ||
                typeof params.arguments !== "object" ||
                Array.isArray(params.arguments)))
          )
            throw new ControlPlaneError(
              400,
              "invalid_request",
              "Invalid tool arguments.",
            );
          result = await manager.call(
            binding,
            params.name,
            (params.arguments ?? {}) as Record<string, unknown>,
          );
          break;
        }
        default:
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not available" },
          };
      }
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      const message =
        error instanceof ControlPlaneError
          ? error.message
          : "The connector request could not be completed.";
      return { jsonrpc: "2.0", id, error: { code: -32000, message } };
    }
  });
  // No SSE stream or persistent sessions: POST responses contain the complete JSON-RPC result.
  app.get("/mcp/:id", async (_r, reply) => reply.code(405).send());
  app.delete("/mcp/:id", async (_r, reply) => reply.code(405).send());
  return app;
}
