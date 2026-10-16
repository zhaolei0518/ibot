## Why

Users currently repeat MCP configuration and secrets for each Bot. Provide a global connection experience using the 14 selected Cursor Marketplace plugins, while keeping accounts and per-Bot access under this installation's control.

## What Changes

- Add a curated, provenance-labelled catalogue for Gmail, Cloudflare, Vercel, GitLab, GitBook, Notion, Google Sheets, Semrush, Ahrefs, X, aisa, GitHub, Origin and Firecrawl.
- Add encrypted multi-account configuration, OAuth authorization/refresh/disconnect and actual MCP tool discovery.
- Bind accounts and explicit tool allowlists to Bots through an authenticated MCP bridge; credentials stay on the host and disconnect takes effect immediately.
- Add Settings and Bot settings interfaces and operational documentation.
- Expose unsupported or externally blocked providers honestly; Cursor-only dependencies are not silently reused. Skills-only plugins are identified separately.

## Capabilities

### New Capabilities
- `global-connectors`: catalogue, account lifecycle, tool discovery and per-Bot invocation.

### Modified Capabilities
None. Existing manual MCP servers remain supported.

## Impact

API server, encrypted database repositories, MCP SDK dependency, web Settings and Bot settings. A dedicated authenticated bridge listener is required for VM access. No OS accounts are created. No Cursor private API or credentials are reused.
