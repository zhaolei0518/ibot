import {
  CONNECTOR_SOURCES,
  type ConnectorSource,
} from "./connector-sources.js";
/** Curated adapters. Marketplace provenance is separate from independently usable MCP endpoints. */
export interface ConnectorPlugin {
  id: string;
  name: string;
  description: string;
  marketplace_url: string;
  marketplace_verified: boolean;
  source?: ConnectorSource;
  endpoint?: string;
  docs_url?: string;
  kind: "connector" | "skills";
  setup: string;
  color: string;
}
const plugin = (
  id: string,
  name: string,
  description: string,
  setup: string,
  color: string,
  endpoint?: string,
  docs_url?: string,
  kind: ConnectorPlugin["kind"] = "connector",
): ConnectorPlugin => ({
  id,
  name,
  description,
  setup,
  color,
  endpoint,
  docs_url,
  kind,
  source: CONNECTOR_SOURCES[id],
  marketplace_verified: [
    "cloudflare",
    "vercel",
    "gitlab",
    "gitbook",
    "notion",
    "firecrawl",
  ].includes(id),
  marketplace_url: [
    "cloudflare",
    "vercel",
    "gitlab",
    "gitbook",
    "notion",
    "firecrawl",
  ].includes(id)
    ? `https://cursor.com/marketplace/${id}`
    : "https://cursor.com/marketplace",
});
export const CONNECTOR_CATALOG: readonly ConnectorPlugin[] = [
  plugin(
    "gmail",
    "Gmail",
    "Search and manage email",
    "Configure an independently accessible Google Workspace MCP service and its Google OAuth application.",
    "#dc4537",
    undefined,
    "https://github.com/taylorwilsdon/google_workspace_mcp",
  ),
  plugin(
    "cloudflare",
    "Cloudflare",
    "Inspect and manage Cloudflare services",
    "Sign in with Cloudflare. Available tools depend on account permissions.",
    "#e87b21",
    "https://mcp.cloudflare.com/mcp",
    "https://github.com/cloudflare/mcp",
  ),
  plugin(
    "vercel",
    "Vercel",
    "Projects, deployments and logs",
    "Vercel requires approved MCP clients. A client registration may be needed.",
    "#555555",
    "https://mcp.vercel.com",
    "https://vercel.com/docs/agent-resources/vercel-mcp",
  ),
  plugin(
    "gitlab",
    "GitLab",
    "Repositories and work items",
    "Use your instance's /api/v4/mcp endpoint. Check GitLab version and MCP access settings.",
    "#db6326",
    "https://gitlab.com/api/v4/mcp",
    "https://docs.gitlab.com/user/model_context_protocol/mcp_server/",
  ),
  plugin(
    "gitbook",
    "GitBook",
    "Read and edit documentation",
    "Connect with OAuth or a personal access token.",
    "#53616d",
    "https://mcp.gitbook.com/mcp",
    "https://gitbook.com/docs/docs-as-code/gitbook-mcp",
  ),
  plugin(
    "notion",
    "Notion",
    "Search and update workspace pages",
    "Sign in to Notion and select the pages this connection can access.",
    "#555555",
    "https://mcp.notion.com/mcp",
    "https://developers.notion.com/docs/mcp",
  ),
  plugin(
    "google-sheets",
    "Google Sheets",
    "Read and update spreadsheets",
    "Configure a Google Workspace MCP service. Self-hosting requires your own Google OAuth application.",
    "#188653",
    undefined,
    "https://github.com/taylorwilsdon/google_workspace_mcp",
  ),
  plugin(
    "semrush",
    "Semrush",
    "SEO and marketing research",
    "Enter the MCP endpoint supplied by your Semrush integration and check subscription access.",
    "#e76b30",
  ),
  plugin(
    "ahrefs",
    "Ahrefs",
    "Search and backlink research",
    "Enter the official MCP endpoint for your account and check subscription access.",
    "#2774a7",
  ),
  plugin(
    "x",
    "X",
    "Access your X integration",
    "The screenshot confirms this plugin; its independent MCP endpoint must be configured. Cursor account tokens cannot be reused.",
    "#555555",
  ),
  plugin(
    "aisa",
    "aisa",
    "Connected aisa tools",
    "Confirm the plugin publisher and independent MCP endpoint before connecting.",
    "#777777",
  ),
  plugin(
    "github",
    "GitHub",
    "Repositories, issues and pull requests",
    "Use a GitHub token supported by the remote MCP service, or register an OAuth client if required.",
    "#475361",
    "https://api.githubcopilot.com/mcp/",
    "https://github.com/github/github-mcp-server",
  ),
  plugin(
    "origin",
    "Origin",
    "Connected Origin tools",
    "Confirm the plugin publisher and independent MCP endpoint before connecting.",
    "#6e6250",
  ),
  plugin(
    "firecrawl",
    "Firecrawl",
    "Web research skills",
    "Import the ten Skills from the pinned Cursor package, then add a Skills-only connection. An external Firecrawl MCP can also be configured.",
    "#e66d36",
    undefined,
    "https://github.com/firecrawl/firecrawl-mcp-server",
    "skills",
  ),
];
export interface ConnectorTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
export interface ConnectorAccount {
  id: string;
  plugin_id: string;
  label: string;
  endpoint: string;
  auth_mode: "oauth" | "token" | "none";
  status: "setup" | "connected" | "needs_auth" | "error" | "disconnected";
  tools: ConnectorTool[];
  error: string | null;
  updated_at: string;
}
export interface ConnectorBinding {
  id: string;
  account_id: string;
  dot_id: string;
  tools: string[];
  confirmation: "ask" | "allow";
  server_name: string;
}

export interface ConnectorResources {
  repo: string;
  ref: string;
  servers: { name: string; url?: string; command?: string }[];
  skills: {
    name: string;
    description: string;
    content: string;
    path: string;
    sha256: string;
  }[];
}
