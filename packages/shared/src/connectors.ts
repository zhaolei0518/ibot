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
  default_auth?: "oauth" | "token" | "none";
  unavailable_reason?: string;
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
  default_auth: ["github", "firecrawl", "x", "gmail"].includes(id)
    ? "token"
    : "oauth",
  unavailable_reason:
    id === "google-sheets"
      ? "Cursor’s Google Sheets service requires Cursor-managed authentication (x-cursor-auth). Independent Google OAuth needs a separately configured Workspace service."
      : id === "origin"
        ? "The publisher and service for this entry have not been verified. Administrator setup is required before accounts can be connected."
        : undefined,
  marketplace_verified: [
    "cloudflare",
    "vercel",
    "gitlab",
    "gitbook",
    "notion",
    "firecrawl",
    "gmail",
    "google-sheets",
    "semrush",
    "ahrefs",
    "x",
    "github",
  ].includes(id),
  marketplace_url: [
    "cloudflare",
    "vercel",
    "gitlab",
    "gitbook",
    "notion",
    "firecrawl",
    "gmail",
    "google-sheets",
    "semrush",
    "ahrefs",
    "x",
    "github",
  ].includes(id)
    ? `https://cursor.com/marketplace/${id}`
    : "https://cursor.com/marketplace",
});
export const CONNECTOR_CATALOG: readonly ConnectorPlugin[] = [
  plugin(
    "gmail",
    "Gmail",
    "Search and manage email",
    "Connect your Google account using Google OAuth credentials or an access token.",
    "#dc4537",
    "https://gmailmcp.googleapis.com/mcp/v1",
    "https://github.com/cursor/plugins/tree/f713f14203cd6420cec13cd7c55c32d598dbab68/third_party/gmail",
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
    "The Cursor-hosted connector requires Cursor authentication. Independent Google account authorization is not available on this endpoint.",
    "#188653",
    "https://api.cursor.com/rest-mcp/google-sheets/mcp",
    "https://github.com/cursor/plugins/tree/f713f14203cd6420cec13cd7c55c32d598dbab68/third_party/google-sheets",
  ),
  plugin(
    "semrush",
    "Semrush",
    "SEO and marketing research",
    "Sign in to Semrush or provide an access token. Your subscription controls available tools.",
    "#e76b30",
    "https://mcp.semrush.com/v2/mcp",
  ),
  plugin(
    "ahrefs",
    "Ahrefs",
    "Search and backlink research",
    "Sign in to Ahrefs or provide an API token. Your subscription controls available tools.",
    "#2774a7",
    "https://api.ahrefs.com/mcp/mcp",
  ),
  plugin(
    "x",
    "X",
    "Access your X integration",
    "Use your own X access token or registered OAuth client. Cursor’s registered client cannot be reused.",
    "#555555",
    "https://api.x.com/mcp",
  ),
  plugin(
    "aisa",
    "aisa",
    "Search data services and use AIsa tools",
    "Sign in with AIsa OAuth, or enter your AIsa API key. Service calls may incur usage charges.",
    "#777777",
    "https://mcp.aisa.one/mcp",
    "https://aisa.one/docs/agent-quickstart.md",
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
    "Connect using a Firecrawl API key, or use the imported workflow Skills without an external account.",
    "#e66d36",
    "https://mcp.firecrawl.dev/v2/mcp",
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
