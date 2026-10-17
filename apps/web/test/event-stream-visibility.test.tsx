// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const signals = vi.hoisted(() => [] as AbortSignal[]);
vi.mock("../src/lib/api", () => ({ api: { stream: ({signal}: {signal: AbortSignal}) => {
  signals.push(signal);
  return (async function* () { await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), {once:true}); }); })();
} } }));
import { EventStreamProvider } from "../src/components/events";
afterEach(() => { cleanup(); vi.restoreAllMocks(); signals.length = 0; });
it("releases the live HTTP connection while hidden and reopens when visible", async () => {
  let visibility: DocumentVisibilityState = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  render(<EventStreamProvider><span>App</span></EventStreamProvider>);
  await waitFor(() => expect(signals).toHaveLength(1));
  act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
  await waitFor(() => expect(signals[0]!.aborted).toBe(true));
  act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
  await waitFor(() => expect(signals).toHaveLength(2));
  expect(signals[1]!.aborted).toBe(false);
});
