CREATE TABLE connector_installs (plugin_id text PRIMARY KEY, installed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE connector_accounts (
  id text PRIMARY KEY, plugin_id text NOT NULL REFERENCES connector_installs(plugin_id), label text NOT NULL,
  endpoint text NOT NULL, auth_mode text NOT NULL CHECK (auth_mode IN ('oauth','token','none')),
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','connected','needs_auth','error','disconnected')),
  tools jsonb NOT NULL DEFAULT '[]', error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE connector_bindings (
  id text PRIMARY KEY, account_id text NOT NULL REFERENCES connector_accounts(id) ON DELETE CASCADE,
  dot_id text NOT NULL REFERENCES dots(id) ON DELETE CASCADE, tools jsonb NOT NULL,
  confirmation text NOT NULL CHECK (confirmation IN ('ask','allow')), server_name text NOT NULL,
  token_hash text NOT NULL UNIQUE, UNIQUE(dot_id, server_name)
);
CREATE TABLE connector_oauth_states (
  state_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES connector_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, data_enc bytea
);
CREATE TABLE connector_calls (
  id bigserial PRIMARY KEY, binding_id text NOT NULL, tool_name text NOT NULL,
  outcome text NOT NULL, duration_ms integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connector_resources (
  plugin_id text PRIMARY KEY REFERENCES connector_installs(plugin_id),
  resources jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
