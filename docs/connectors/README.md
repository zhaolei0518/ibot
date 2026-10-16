# Global connectors

Settings -> Connectors manages shared accounts. Dot settings -> Connected accounts assigns an account and an explicit tool list to a Dot. Existing manually configured MCP servers continue to work.

## What is implemented

- A curated catalogue containing the 14 plugins from the supplied screenshot, with data-only MCP/Skills imports from six verified public, pinned plugin sources.
- Installation of connector adapters (registration in this installation), separately named accounts, encrypted bearer/OAuth credentials, actual MCP tool discovery, and paginated tool lists.
- MCP OAuth discovery, dynamic client registration where supported, optional registered clients, PKCE, single-use ten-minute callbacks, token refresh, and local disconnect.
- Dot bindings with explicit tool allowlists, a read-only selection shortcut based on provider annotations, and the engine's server-level approval policy (ask by default).
- A stateless authenticated MCP bridge: provider credentials remain on the host, each binding has an independent random bearer credential, and disconnect/removal blocks subsequent calls.
- Redacted recent call outcomes (latest 50 displayed, latest 10,000 retained). Arguments, returned content and provider credentials are not stored in this call log.

This is not an authenticated mirror of Cursor's private marketplace service. Cursor account sessions and previously authorized connector tokens are not imported. Registering an adapter does not execute a plugin’s scripts or hooks. Import resources downloads the pinned MCP metadata and SKILL.md files only; it does not install script/reference dependencies. Imported Skills are read through an explicitly permitted MCP tool. The official market and provider documents are linked as provenance; an unknown source is labelled pending verification.

## Provider status

Research date: 2026-10-16. A public endpoint or source link does not mean this installation has authorized an account or passed that provider's client review.

| Plugin | Default independent endpoint | Remaining setup |
| --- | --- | --- |
| Gmail | No assumed endpoint | Supply a separately deployed Google Workspace MCP service and configure its Google OAuth application. Its MCP login is a separate layer from Google's upstream authorization. |
| Cloudflare | `https://mcp.cloudflare.com/mcp` | Complete Cloudflare authorization and check account permissions. |
| Vercel | `https://mcp.vercel.com` | Check Vercel's client review/registration requirements, then authorize. |
| GitLab | `https://gitlab.com/api/v4/mcp` | For self-managed GitLab, substitute the instance URL and check version, MCP settings and OAuth support. |
| GitBook | `https://mcp.gitbook.com/mcp` | OAuth or an independently issued supported personal token. |
| Notion | `https://mcp.notion.com/mcp` | Complete Notion OAuth with workspace/page selection. |
| Google Sheets | No assumed endpoint | Same Google Workspace prerequisite as Gmail. |
| Semrush | No guessed endpoint | Confirm the plugin's publisher, independent MCP endpoint and subscription requirements. |
| Ahrefs | No guessed endpoint | Confirm the plugin's publisher, independent MCP endpoint and subscription requirements. |
| X | No guessed endpoint | Confirm an independently usable endpoint; Cursor's private connector tokens cannot be reused. |
| aisa | No guessed endpoint | Confirm the exact publisher and independent service. |
| GitHub | `https://api.githubcopilot.com/mcp/` | Use a supported GitHub token or register a supported OAuth client. Public market detail page remains unverified. |
| Origin | No guessed endpoint | Confirm the exact publisher and independent service. |
| Firecrawl | No assumed endpoint | Import the ten pinned Skills and create a Skills-only connection; an independently configured Firecrawl MCP can be connected separately. |

Public Cursor detail pages were found for Cloudflare, Vercel, GitLab, GitBook, Notion and Firecrawl. The other eight entries are taken from the user's screenshot; their catalogue links open the marketplace landing page rather than fabricated detail URLs. The marketplace's HTML includes broad catalogue data, so a name occurring in a page is not proof of its detail page or connector implementation.

The six imported source sets were fetched and parsed successfully using the actual importer:

| Plugin | Repository | Skills |
| --- | --- | --- |
| Cloudflare | `cloudflare/skills` | 16 |
| Vercel | `vercel/vercel-plugin` | 33 |
| GitLab | `nickveenhof/cursor-gitlab-plugin` | 1 |
| GitBook | `GitbookIO/gitbook-skills` | 6 |
| Notion | `makenotion/cursor-notion-plugin` | 14 |
| Firecrawl | `firecrawl/firecrawl-cursor-plugin` | 10 |

The first five repository references with file links were pinned from marketplace provenance (Cloudflare, Vercel, GitLab, Notion, Firecrawl); GitBook's linked repository HEAD was separately resolved and pinned. The fixed revisions and allowed file paths are in `packages/shared/src/connector-sources.ts`. Runtime imports use those revisions, impose file/count limits, and never run downloaded code. Reimporting does not follow a floating branch.

Useful sources:

- https://cursor.com/marketplace
- https://cursor.com/docs/context/mcp
- https://github.com/cloudflare/mcp
- https://vercel.com/docs/agent-resources/vercel-mcp
- https://docs.gitlab.com/user/model_context_protocol/mcp_server/
- https://gitbook.com/docs/docs-as-code/gitbook-mcp
- https://developers.notion.com/docs/mcp
- https://github.com/github/github-mcp-server
- https://github.com/taylorwilsdon/google_workspace_mcp
- https://github.com/firecrawl/firecrawl-mcp-server

## Deployment

Developed on `feat/global-connectors`, from deployed commit `d4537fe`. Development and tests used an isolated local checkout and temporary databases. Code commit `1872d06` is now deployed on 10.41.82.104:3000, with the six public source sets imported and a Firecrawl Skills-only connection assigned to the existing `my` Bot. External provider accounts have not been authorized.

Use Node >=24.15 (the current locked web test dependencies require it; the existing server's Node 24.22 satisfies it). Install dependencies with `npm ci`, run `npm run typecheck`, relevant tests, then `npm run build`.

The API and web client remain on their existing listeners. Enable the additional bridge explicitly in the existing service environment:

```dotenv
# The external HTTPS web origin; OAuth redirects return through the existing web API proxy.
INVISIBLE_DOTS_PUBLIC_URL=https://your-bot-host.example.com
# Choose a listener reachable from the existing QEMU guests.
INVISIBLE_DOTS_CONNECTOR_BRIDGE_LISTEN=127.0.0.1:8788
# QEMU user-networking's host address. This must resolve from inside the VM.
INVISIBLE_DOTS_CONNECTOR_BRIDGE_URL=http://10.0.2.2:8788
```

The deployed QEMU guests successfully reached this loopback listener through 10.0.2.2. For another VM network, change the bridge URL and listener to that network’s reachable host address. Restrict the listener to the appropriate host/VM network where possible. The bridge accepts only per-binding credentials, never the control-plane master token. Do not expose the control-plane API to make the bridge reachable.

OAuth redirect URI to register with providers that require static registration:

```text
https://your-bot-host.example.com/api/connectors/oauth/callback
```

`http://localhost` is supported for development. An HTTP private-IP URL such as the current port-3000 deployment is not accepted as a production OAuth return URL. Configure an HTTPS reverse proxy or an approved localhost tunnel before external OAuth acceptance testing.

Before deployment, stop the existing service and back up its data directory and master key using the existing protected backup process. Never open the live PGlite database from a second process. Restart the same `invisible-dots.service` as `zhaoleilei1`; this runs the additive `0015_global_connectors` migration. No new OS account or `/home` directory is needed. This project refuses databases with unknown migration versions, so rollback requires restoring the pre-migration database as well as the previous build.

## Account setup

1. Open Settings -> Connectors. For supported public packages, Import resources retrieves the pinned MCP metadata and Skills. Choose Set up, name the account, check its endpoint and authentication method, and save. For Firecrawl, keep Use imported Skills only checked to create a local workflow connection without remote credentials.
2. OAuth: use Sign in, then Continue to the provider. If required, enter a pre-registered MCP OAuth client and its authorization server issuer first. Google client credentials for self-hosted Workspace MCP belong in that service's configuration, not the MCP client's credential form.
3. Token: use Set token to submit a token, then Refresh tools. Values are write-only. No authentication is available for intentionally public/self-hosted services.
4. Confirm the status is Connected and inspect the discovered tool list.
5. Open the Dot’s settings, select the account, choose tools and approval policy, then Connect to this Dot. Enable `idots_read_plugin_skill` to let the Dot retrieve the plugin’s imported workflow instructions by name. Bindings apply immediately, independently of the general config draft.
6. Remove a Dot binding to revoke that Dot's credential. Disconnect an account to remove locally stored credentials and invalidate all pending authorization flows. This locally blocks all its Bot bindings; provider-side grants can additionally be revoked in the provider's account settings.

Endpoint changes require a new account to avoid carrying tokens across services. A disconnected OAuth account with a static client needs its client information re-entered, since disconnect deletes all of that account's local credentials. Other manually defined MCP entries remain editable through the existing MCP servers panel.

## Validation and outstanding acceptance

Automated fixtures use actual HTTP JSON-RPC and OAuth requests through the official MCP SDK. They cover discovery, encrypted storage, real-client bridge use, tool filtering, forbidden calls, cross-Bot identity, binding removal, disconnect, restart of the manager, DCR, PKCE code exchange, refresh, state expiry/replay and sanitized callbacks. UI tests cover all 14 cards, account setup, provider authorization links and read-only Bot binding. No actual provider consent or user data is used in fixtures.

External acceptance is still pending: HTTPS callback configuration, provider client registrations and account consents; Google OAuth client creation and Workspace MCP deployment; independently usable endpoints for the unresolved providers; actual execution of workflows requiring third-party scripts/reference dependencies that are not part of the data-only import. Those are not represented as successful connections in the UI or as completed external acceptance in OpenSpec.

## Deployment record

- Code: `1872d06` (`feat: add global connectors and scoped MCP access`). No external Git push was performed.
- UI: `http://10.41.82.104:3000/settings#connectors`.
- Running release: `/home/zhaoleilei1/invisible-dots/releases/connectors-1872d06`.
- Existing original checkout remains at `/home/zhaoleilei1/invisible-dots/app`; systemd's `connectors.conf` drop-in selects the release working directory.
- Service: `invisible-dots.service`, user/group `zhaoleilei1`; API `127.0.0.1:8787`, bridge `127.0.0.1:8788`, guest bridge URL `http://10.0.2.2:8788`.
- Pre-migration backup: `/home/zhaoleilei1/invisible-dots/backups/pre-connectors-20261016-192802.tar.gz`, mode 0600, containing database and protected config. The service was stopped while the backup was taken. No second PGlite process opened the live database.
- `my`: MCP server `cx-75a666aff8729992` connected with one allowed tool, `idots_read_plugin_skill`; actual guest -> host bridge -> imported Firecrawl workflow read completed successfully (audit outcome `ok`, 3 ms). The model chose the skill's declared name `firecrawl`; file/folder names need not equal frontmatter names.
- The existing model provider remains `openai_compatible`; the Bot produced its response through the configured private gateway.
- OAuth is disabled until an HTTPS callback origin is supplied. The deployment created no OS users or new home-directory accounts.

### Built-in presets update

All 14 catalogue adapters register automatically on first catalogue load. Twelve have independently documented service presets; account authorization remains required. Endpoints are hidden behind Advanced service settings. Token accounts accept the secret during creation, encrypt it in the same transaction, then discover tools. OAuth accounts still need the approved public callback origin and, where required, their own client registration.

Additional pinned Cursor manifests are from `cursor/plugins` at `f713f14203cd6420cec13cd7c55c32d598dbab68` (Gmail, Sheets, Semrush, Ahrefs, X, GitHub). AIsa uses its official quickstart at https://aisa.one/docs/agent-quickstart.md and `https://mcp.aisa.one/mcp` (OAuth/Bearer). Firecrawl uses the provider-documented `https://mcp.firecrawl.dev/v2/mcp` with an API key; existing Skills-only accounts remain valid.

Google Sheets now connects directly to Google's official `https://sheetsmcp.googleapis.com/mcp/v1`, as documented at https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server. Initialization and listing six tools succeeded; an unauthenticated call using a deliberately nonexistent sheet ID returned 401. This verifies the protocol and authentication boundary, not a real account connection. Google currently requires Developer Preview access, enabled Sheets and Sheets MCP APIs, and a registered Google OAuth client (or an already issued OAuth access token). The earlier Cursor relay finding only describes that relay; it is not a limitation of Google's official service. No preset runtime endpoint now uses cursor.com. Origin remains unverified.
