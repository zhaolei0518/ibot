## ADDED Requirements

### Requirement: Curated marketplace catalogue
The system SHALL expose all 14 selected plugins with marketplace provenance, installation state, connector versus Skills classification, and setup requirements. It SHALL NOT report an untested provider as connected.

#### Scenario: Browse selected plugins
- **WHEN** the operator opens Settings connectors
- **THEN** all selected plugins are visible and providers requiring configuration explain what is missing

### Requirement: Encrypted account lifecycle
The system SHALL support separately named accounts, encrypted secrets, OAuth PKCE authorization, refresh and disconnect. OAuth callbacks SHALL consume an expiring single-use state and use an administrator configured redirect URI. Credential read APIs SHALL return only configured status.

#### Scenario: Complete authorization
- **WHEN** a valid unexpired OAuth callback is received
- **THEN** tokens are encrypted and actual tool discovery determines whether the account is usable

#### Scenario: Reject replay
- **WHEN** an expired or consumed state is submitted
- **THEN** authorization is refused without exposing secrets

#### Scenario: Disconnect
- **WHEN** an operator disconnects an account
- **THEN** tokens and outstanding authorization are removed and existing Bot access fails immediately

### Requirement: Explicit per-Bot access
The system SHALL bind an account to an existing Bot with an explicit tool allowlist and server-level confirmation policy. The model SHALL receive only permitted tools. Account credentials SHALL remain on the host.

#### Scenario: Invoke allowed tool
- **WHEN** a Bot authenticates using its binding token and calls an allowed tool
- **THEN** the bridge checks current account and binding state and executes the upstream MCP tool

#### Scenario: Reject forbidden tool
- **WHEN** a Bot calls an unselected tool or uses a deleted binding token
- **THEN** no upstream invocation occurs

### Requirement: Operational visibility
The system SHALL expose discovery errors and redacted invocation status without recording arguments, provider secrets or returned content. The UI SHALL allow discovery refresh, tool selection, reconnection and binding removal.

#### Scenario: Provider failure
- **WHEN** upstream authorization or execution fails
- **THEN** a safe actionable status is shown and a redacted outcome is stored

### Requirement: Pinned marketplace resources
The system SHALL import reviewed public MCP metadata and SKILL.md files from fixed source revisions, record their hashes, and offer workflow instructions through an explicitly permitted read-only MCP tool. It SHALL NOT execute downloaded commands or hooks or claim referenced files are installed.

#### Scenario: Import the six verified source packages
- **WHEN** the operator imports resources for Cloudflare, Vercel, GitLab, GitBook, Notion or Firecrawl
- **THEN** the fixed source revision is fetched, MCP definitions and Skills are parsed, and the imported count is shown

#### Scenario: Use Skills without an external account
- **WHEN** the operator creates a Firecrawl Skills-only connection after importing resources
- **THEN** its reader tool can be explicitly bound to a Bot without third-party account credentials

#### Scenario: Reject an incomplete import
- **WHEN** a source response is oversized, unavailable or malformed
- **THEN** existing resources remain intact and a sanitized import error is shown

### Requirement: Preset services and one-step credentials
The system SHALL include all 14 catalogue entries by default, preset verified provider endpoints, and accept an access token in the account creation form without requiring endpoint entry. Preset availability SHALL NOT imply successful authorization. Providers requiring platform-owned authentication or without verified service identity SHALL show their setup limitations.

#### Scenario: Token account with a preset endpoint
- **WHEN** a user selects GitHub and supplies an access token
- **THEN** the account uses the verified default endpoint and atomically stores the token encrypted before discovering tools

#### Scenario: Cursor-owned Google Sheets authentication
- **WHEN** a user opens the Google Sheets preset
- **THEN** the UI explains the Cursor-managed authentication requirement and does not claim ordinary Google OAuth is supported at that service
