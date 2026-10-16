// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTOR_CATALOG,
  type ConnectorAccount,
} from "@invisible-dots/shared/browser";
import { Connectors } from "../src/components/settings/Connectors";
import { DotConnectors } from "../src/components/dot-settings/connectors-panel";
const account: ConnectorAccount = {
  id: "c1",
  plugin_id: "google-sheets",
  label: "Work sheets",
  endpoint: "https://example.com/mcp",
  auth_mode: "token",
  status: "connected",
  error: null,
  updated_at: "2026-10-16T00:00:00Z",
  tools: [
    {
      name: "read_sheet",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
    { name: "write_sheet", inputSchema: { type: "object" } },
  ],
};
function fixture(accounts: ConnectorAccount[] = []) {
  const writes: { url: string; body: unknown; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET")
        writes.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
          method,
        });
      let value: unknown = {};
      if (url === "/api/connectors")
        value = {
          plugins: CONNECTOR_CATALOG.map((p) => ({ ...p, installed: false })),
          accounts,
          oauth_configured: true,
          bridge_configured: true,
        };
      else if (url === "/api/dots/d1/connectors" && method === "GET")
        value = { bindings: [] };
      else if (url === "/api/connectors/accounts" && method === "POST")
        value = { id: "new-account" };
      else if (url.endsWith("/authorize"))
        value = {
          authorization_url: "https://provider.example/authorize?state=test",
        };
      return Response.json(value);
    }),
  );
  return writes;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("connector Settings", () => {
  it("lists all 14 plugins, distinguishes Skills and records explicit account setup", async () => {
    const writes = fixture();
    render(<Connectors />);
    await screen.findByRole("heading", { name: "Google Sheets" });
    expect(screen.getAllByRole("article")).toHaveLength(14);
    const firecrawl = screen
      .getByRole("heading", { name: "Firecrawl" })
      .closest("article")!;
    expect(within(firecrawl).getByText("Skills · optional MCP")).toBeTruthy();
    const sheets = screen
      .getByRole("heading", { name: "Google Sheets" })
      .closest("article")!;
    await userEvent.click(
      within(sheets).getByRole("button", { name: "Set up" }),
    );
    await screen.findByRole("heading", { name: "Set up Google Sheets" });
    fireEvent.change(screen.getByLabelText("MCP endpoint"), {
      target: { value: "https://workspace.example/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Authentication"), {
      target: { value: "token" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() =>
      expect(writes.some((w) => w.url === "/api/connectors/accounts")).toBe(
        true,
      ),
    );
    expect(
      writes.find((w) => w.url === "/api/connectors/accounts")?.body,
    ).toMatchObject({
      plugin_id: "google-sheets",
      endpoint: "https://workspace.example/mcp",
      auth_mode: "token",
    });
  });
  it("creates a Firecrawl Skills-only connection without requiring a remote endpoint", async () => {
    const writes = fixture();
    render(<Connectors />);
    const card = (
      await screen.findByRole("heading", { name: "Firecrawl" })
    ).closest("article")!;
    await userEvent.click(within(card).getByRole("button", { name: "Set up" }));
    await screen.findByRole("heading", { name: "Set up Firecrawl" });
    expect(screen.queryByLabelText("MCP endpoint")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() =>
      expect(
        writes.find((w) => w.url === "/api/connectors/accounts")?.body,
      ).toMatchObject({ plugin_id: "firecrawl", skills_only: true }),
    );
  });
  it("offers provider authorization without storing login URLs or tokens in localStorage", async () => {
    fixture([
      { ...account, auth_mode: "oauth", status: "needs_auth", tools: [] },
    ]);
    render(<Connectors />);
    await userEvent.click(screen.getByRole("button", { name: /Accounts/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Sign in" }),
    );
    expect(
      (
        await screen.findByRole("link", { name: /Continue to the provider/ })
      ).getAttribute("href"),
    ).toBe("https://provider.example/authorize?state=test");
    expect(localStorage.length).toBe(0);
  });
  it("binds only selected read-only tools and defaults to asking before use", async () => {
    const writes = fixture([account]);
    const reload = vi.fn();
    render(<DotConnectors dotId="d1" reload={reload} />);
    await screen.findByRole("option", { name: "Work sheets · google-sheets" });
    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "c1" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Read-only tools" }),
    );
    expect(
      (screen.getByRole("checkbox", { name: "read_sheet" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "write_sheet",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Connect to this Dot" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(
      writes.find((w) => w.url === "/api/dots/d1/connectors")?.body,
    ).toEqual({ account_id: "c1", tools: ["read_sheet"], confirmation: "ask" });
  });
});
