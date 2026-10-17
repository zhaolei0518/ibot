import { afterEach, expect, it, vi } from "vitest";
import { connectorRequest } from "../src/lib/connectors";
afterEach(() => vi.unstubAllGlobals());
it("identifies the failed operation and request without exposing credentials", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(new DOMException("signal timed out", "TimeoutError")),
  );
  const error = await connectorRequest("connectors/accounts", "POST", {
    token: "private-test-token",
  }).catch((e) => e as Error);
  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(message).toContain(
    "Save account: no response within 30 seconds",
  );
  expect(message).toContain("POST /api/connectors/accounts");
  expect(message).toContain("Check Accounts before retrying");
  expect(message).not.toContain("private-test-token");
});
it("identifies a tool discovery failure separately from account creation", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Provider unavailable" }, { status: 502 }),
      ),
  );
  await expect(
    connectorRequest("connectors/accounts/c1/discover", "POST"),
  ).rejects.toThrow("Discover provider tools: Provider unavailable (HTTP 502;");
});
