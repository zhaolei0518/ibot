# Verification

- `openspec validate add-global-connectors --strict`: passed.
- `npm run typecheck`: passed (control plane, web, browser test types).
- `npm run build`: passed (CLI with migrations and standalone Next.js).
- Focused API, startup, database, web, proxy and repository regression run: **374 tests in 22 files passed**.
- Actual pinned public resource imports passed: Cloudflare 16 Skills, Vercel 33, GitLab 1, GitBook 6, Notion 14, Firecrawl 10. Revisions and MCP endpoints are recorded in `docs/connectors/source-verification.json`.
- Browser layout and setup interaction reviewed with agent-browser against an isolated control plane and the production standalone web build.
- No real provider OAuth consent or customer-data read/write is represented by fixture results. External acceptance remains tracked in tasks section 5.
