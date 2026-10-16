import type {
  ConnectorResources,
  ConnectorAccount,
  ConnectorBinding,
  ConnectorTool,
} from "@invisible-dots/shared";
import type { Queryable } from "./db.js";
import type { SecretBox } from "./crypto.js";
import { isoRequired } from "./rows.js";
type AccountRow = Omit<ConnectorAccount, "updated_at"> & {
  updated_at: Date | string;
};
const account = (r: AccountRow): ConnectorAccount => ({
  ...r,
  updated_at: isoRequired(r.updated_at),
});
export class ConnectorsRepository {
  constructor(
    private readonly q: Queryable,
    private readonly box: SecretBox,
  ) {}
  async resources(id: string): Promise<ConnectorResources | null> {
    return (
      (
        await this.q.query<{ resources: ConnectorResources }>(
          "SELECT resources FROM connector_resources WHERE plugin_id=$1",
          [id],
        )
      ).rows[0]?.resources ?? null
    );
  }
  async saveResources(
    id: string,
    resources: ConnectorResources,
  ): Promise<void> {
    await this.q.query(
      "INSERT INTO connector_resources(plugin_id,resources) VALUES($1,$2::jsonb) ON CONFLICT(plugin_id) DO UPDATE SET resources=EXCLUDED.resources,imported_at=now()",
      [id, JSON.stringify(resources)],
    );
  }
  async installs(): Promise<string[]> {
    return (
      await this.q.query<{ plugin_id: string }>(
        "SELECT plugin_id FROM connector_installs ORDER BY plugin_id",
      )
    ).rows.map((r) => r.plugin_id);
  }
  async install(id: string): Promise<void> {
    await this.q.query(
      "INSERT INTO connector_installs(plugin_id) VALUES($1) ON CONFLICT DO NOTHING",
      [id],
    );
  }
  async accounts(): Promise<ConnectorAccount[]> {
    return (
      await this.q.query<AccountRow>(
        "SELECT * FROM connector_accounts ORDER BY label, id",
      )
    ).rows.map(account);
  }
  async account(id: string): Promise<ConnectorAccount | null> {
    const r = (
      await this.q.query<AccountRow>(
        "SELECT * FROM connector_accounts WHERE id=$1",
        [id],
      )
    ).rows[0];
    return r ? account(r) : null;
  }
  async create(
    a: Pick<
      ConnectorAccount,
      "id" | "plugin_id" | "label" | "endpoint" | "auth_mode"
    >,
  ): Promise<void> {
    await this.q.query(
      "INSERT INTO connector_accounts(id,plugin_id,label,endpoint,auth_mode) VALUES($1,$2,$3,$4,$5)",
      [a.id, a.plugin_id, a.label, a.endpoint, a.auth_mode],
    );
  }
  async status(
    id: string,
    status: ConnectorAccount["status"],
    tools: ConnectorTool[],
    error: string | null = null,
  ): Promise<void> {
    await this.q.query(
      "UPDATE connector_accounts SET status=$2,tools=$3::jsonb,error=$4,updated_at=now() WHERE id=$1",
      [id, status, JSON.stringify(tools), error],
    );
  }
  async bindings(dotId?: string): Promise<ConnectorBinding[]> {
    return (
      await this.q.query<ConnectorBinding>(
        `SELECT id,account_id,dot_id,tools,confirmation,server_name FROM connector_bindings ${dotId ? "WHERE dot_id=$1" : ""} ORDER BY id`,
        dotId ? [dotId] : [],
      )
    ).rows;
  }
  async bindingByToken(hash: string): Promise<ConnectorBinding | null> {
    return (
      (
        await this.q.query<ConnectorBinding>(
          "SELECT id,account_id,dot_id,tools,confirmation,server_name FROM connector_bindings WHERE token_hash=$1",
          [hash],
        )
      ).rows[0] ?? null
    );
  }
  async bind(b: ConnectorBinding, hash: string): Promise<void> {
    await this.q.query(
      "INSERT INTO connector_bindings(id,account_id,dot_id,tools,confirmation,server_name,token_hash) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)",
      [
        b.id,
        b.account_id,
        b.dot_id,
        JSON.stringify(b.tools),
        b.confirmation,
        b.server_name,
        hash,
      ],
    );
  }
  async unbind(id: string): Promise<void> {
    await this.q.query("DELETE FROM connector_bindings WHERE id=$1", [id]);
  }
  async beginOAuth(hash: string, id: string): Promise<void> {
    await this.q.query(
      "DELETE FROM connector_oauth_states WHERE expires_at < now() OR account_id=$1",
      [id],
    );
    await this.q.query(
      "INSERT INTO connector_oauth_states(state_hash,account_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [hash, id],
    );
  }
  async verifier(hash: string, value: string): Promise<void> {
    await this.q.query(
      "UPDATE connector_oauth_states SET data_enc=$2 WHERE state_hash=$1",
      [hash, this.box.encrypt(value, `connector-oauth:${hash}`)],
    );
  }
  async oauthAccount(hash: string): Promise<string | null> {
    return (
      (
        await this.q.query<{ account_id: string }>(
          "SELECT account_id FROM connector_oauth_states WHERE state_hash=$1 AND expires_at>now()",
          [hash],
        )
      ).rows[0]?.account_id ?? null
    );
  }
  async consumeOAuth(
    hash: string,
  ): Promise<{ accountId: string; verifier: string } | null> {
    const r = (
      await this.q.query<{ account_id: string; data_enc: Uint8Array | null }>(
        "DELETE FROM connector_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING account_id,data_enc",
        [hash],
      )
    ).rows[0];
    return r?.data_enc
      ? {
          accountId: r.account_id,
          verifier: this.box.decrypt(r.data_enc, `connector-oauth:${hash}`),
        }
      : null;
  }
  async cancelOAuth(id: string): Promise<void> {
    await this.q.query(
      "DELETE FROM connector_oauth_states WHERE account_id=$1",
      [id],
    );
  }
  async clearSecrets(id: string): Promise<void> {
    await this.q.query("DELETE FROM secrets WHERE scope=$1", [
      `connector:${id}`,
    ]);
  }
  async audit(
    binding: string,
    tool: string,
    outcome: string,
    duration: number,
  ): Promise<void> {
    await this.q.query(
      "INSERT INTO connector_calls(binding_id,tool_name,outcome,duration_ms) VALUES($1,$2,$3,$4)",
      [
        binding,
        tool,
        outcome,
        Math.min(Math.max(0, Math.round(duration)), 2147483647),
      ],
    );
    await this.q.query(
      "DELETE FROM connector_calls WHERE id IN (SELECT id FROM connector_calls ORDER BY id DESC OFFSET 10000)",
    );
  }
  async calls(): Promise<unknown[]> {
    return (
      await this.q.query(
        "SELECT * FROM connector_calls ORDER BY id DESC LIMIT 50",
      )
    ).rows;
  }
}
