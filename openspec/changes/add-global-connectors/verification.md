# Verification

- `openspec validate add-global-connectors --strict`: passed.
- `npm run typecheck`: passed (control plane, web, browser test types).
- `npm run build`: passed (CLI with migrations and standalone Next.js).
- Focused API, startup, database, web, proxy and repository regression run: **374 tests in 22 files passed**.
- Actual pinned public resource imports passed: Cloudflare 16 Skills, Vercel 33, GitLab 1, GitBook 6, Notion 14, Firecrawl 10. Revisions and MCP endpoints are recorded in `docs/connectors/source-verification.json`.
- Browser layout and setup interaction reviewed with agent-browser against an isolated control plane and the production standalone web build.
- No real provider OAuth consent or customer-data read/write is represented by fixture results. External acceptance remains tracked in tasks section 5.

## Deployment acceptance

Code `1872d06` deployed to 10.41.82.104:3000 using the existing zhaoleilei1 account. Protected database/config backup taken before migration. API health, 14 catalogue entries, six real resource imports and loopback bridge listener verified. The existing my Bot's guest connected to the bridge via 10.0.2.2 and successfully read the imported Firecrawl skill. Its model response returned through the existing private gateway. OAuth remains unconfigured; actual external provider account acceptance remains pending. See docs/connectors/README.md for exact paths and rollback constraints.

## Setup visibility regression

Google Sheets setup was inserted above the catalogue inside the Settings scroll container. Input autofocus did not reliably bring the form into view after the install/reload layout update. Setup now explicitly scrolls the form into view and focuses the account name after the operation finishes, including reopening. Connector UI regression: 5 tests passed; all project typechecks passed. This change does not configure Google OAuth or provision a Workspace MCP endpoint.

## Immediate account setup dialog

The inline visibility fix did not meet the expected popup interaction. Set up and Add account now open a modal synchronously without installing or reloading first (account creation already registers the plugin transactionally). Network requests have a 30-second timeout; catalogue reload no longer holds the action lock; save failures appear inside the dialog. Regression tests cover both installed/uninstalled entries and reopening: 6 tests passed. Project typechecks passed.

## Built-in services and one-step tokens

All 14 adapters now register on catalogue load. Twelve independent endpoint presets are documented; Sheets is explicitly blocked by Cursor-owned x-cursor-auth and Origin awaits identity. AIsa preset was verified against https://aisa.one/docs/agent-quickstart.md (OAuth/Bearer). Twelve pinned Cursor resource sets loaded successfully, including the official X skill with its human-readable name. Token creation is transactional and encrypted; a real HTTP MCP fixture verifies discovery immediately after creation. Six affected regression files: 66 tests passed. Full project typechecks and strict OpenSpec validation passed. No provider user consent or paid AIsa call was performed.

## Google official Sheets service correction

The previous Cursor relay limitation was incorrectly treated as a Google Sheets limitation. Google's official setup guide at https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server documents `https://sheetsmcp.googleapis.com/mcp/v1`. Live initialization and tools/list returned 200 with six tools. A protected get_values call with a deliberately nonexistent sheet ID and no credentials returned 401; no real spreadsheet was accessed. OAuth resource metadata points to accounts.google.com and Sheets/Drive scopes. The catalogue now uses that official endpoint directly, with Developer Preview/API/OAuth prerequisites stated. All preset runtime endpoints are independent of cursor.com. Focused UI/API regression: 16 tests passed; project typechecks and strict OpenSpec validation passed.

## Browser connection saturation investigation

A real browser experiment opened distinct /api/stream requests against the HTTP deployment until its HTTP/1.1 origin connection pool was full. /api/health then timed out at 2 seconds; after aborting those streams, the same request returned 200 in 34ms. This reproduces the user's broad pending/canceled request pattern, though the user's individual Timing details remain unconfirmed. Background tabs now abort their SSE connection and reconnect when visible, releasing slots for ordinary requests. Request errors also include operation/path/reference; proxy writes log sanitized timing without bodies or credentials. Four web regression files: 31 tests passed; project typechecks passed. frame_ant.js was separately confirmed to be extension-owned; its presence alone does not establish causality.

## HTTP event polling fallback

User requests still queued after background SSE release. HTTP deployments on non-loopback hosts now use finite `/api/event-updates` requests every 1.5 seconds, with an initial baseline and cursor-based ordered catch-up. The cursor survives tab visibility changes; full pages drain without delay. HTTPS/loopback retains SSE. This removes the UI's persistent stream socket demand on the HTTP deployment, rather than only reducing background demand. API pagination/baseline, web replay, visibility and activity regressions: 45 tests passed; project typechecks passed. The original browser failure still requires user-side acceptance after loading the new build.
