## Context

The existing engine already supports HTTP MCP and server-level approvals. A host-side bridge can enforce account and tool permissions without sharing provider tokens with guests or rebuilding the guest image. The control plane API remains loopback-only. Development uses a separate checkout of deployed commit d4537fe.

## Goals / Non-Goals

Implement a working global account -> discovered tools -> Bot binding -> MCP call chain, preserving the existing model gateway and manual MCP settings. Catalogue entries have provenance and compatibility states. Do not scrape or execute arbitrary market code, reuse Cursor tokens, or promise all external accounts are authorized without their owners' consent. Import data-only pinned MCP metadata and SKILL.md files from the six verified market sources. Offer a read-only virtual MCP tool to retrieve selected plugin instructions; do not execute scripts/hooks or claim referenced dependencies are installed. Firecrawl supports a local Skills-only account.

## Decisions

- Persist public, pinned package metadata and skill bodies with SHA-256 hashes. Fetch only reviewed raw source paths with bounded responses and concurrency. MCP metadata is parsed as data; commands are never executed.
- Curated marketplace adapters, not an unverified private marketplace API. Persist installation state and explicit account endpoints. Review provider links and distinguish verified defaults from providers requiring endpoint configuration.
- Official MCP SDK for Streamable HTTP, tool discovery and OAuth (PKCE, discovery and DCR where supported). Optional administrator client credentials support static registrations. Public callback origin is configured by the administrator, never inferred from forwarded headers.
- AES-GCM existing SecretsRepository for all credentials and OAuth state. SQL tables store safe account metadata, tools, bindings and redacted audit outcomes. OAuth states expire and are consumed once. Token refresh is serialized per account; reconnect/disconnect invalidates sessions and outstanding authorization.
- Dedicated bridge listener, by default port 8788 and guest URL http://10.0.2.2:8788. Per-binding random bearer token; no control-plane token is exposed. Verify binding, account state and explicit tool allowlist on every tool call. Only initialize, notifications/initialized, ping, tools/list and tools/call are exposed. The existing engine permission controls confirmation.
- Binding creates a reserved manual MCP server entry using the bridge URL and a Dot-scoped secret. Provider tokens never enter Bot config or the VM. Binding deletion invalidates bridge access immediately even before guest config delivery.
- Endpoint configuration accepts HTTPS remote services and local HTTP self-hosted services only through explicit administrator action. OAuth authorization endpoints require HTTPS; reject credential-bearing URLs and unsafe redirect schemes. Never return raw upstream errors, token bodies or authorization codes in errors/audits.

## Risks / Trade-offs

Vercel may require client approval. Google requires an administrator-owned OAuth application for self-hosted connectors. aisa/Origin and provider-specific market manifests may need explicit endpoints; keep visible setup requirements. Token-based connection is an explicit fallback where supported, not an automatic claim of OAuth parity. Shared account changes invalidate existing bindings' allowed tools only by intersection, never widen access.

## Migration / Rollback

Additive SQL migration. No live deployment or OS changes during development. Run tests with isolated PGlite. Deployment requires coordinated restart, migration backup, bridge reachability and OAuth public URL setup; never open live PGlite from a second process. Rollback after migration requires restoring the database backup because this project rejects unknown migrations.

## Validation

Use local MCP/OAuth fixtures for real protocol requests, PKCE callback and token refresh; test expiry/replay, disconnected accounts, cross-Bot access, forbidden tools, encrypted secrets and sanitized errors. UI tests cover catalogue, account state and bindings. External authorization and real customer data tests require actual account consent and credentials; record them separately.
