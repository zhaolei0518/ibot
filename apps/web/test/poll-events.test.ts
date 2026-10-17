import { afterEach, expect, it, vi } from "vitest";
import { pollEvents } from "../src/lib/poll-events";
afterEach(() => { vi.unstubAllGlobals(); });
it("resumes after a baseline cursor without holding a streaming response", async () => {
 const controller = new AbortController();
 const onCursor = vi.fn();
 const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ events: [], cursor: 42 })).mockResolvedValueOnce(Response.json({ events: [{id:43, type:"agent.state"}], cursor:43 }));
 vi.stubGlobal("fetch", fetcher);
 const stream = pollEvents({ signal:controller.signal, onCursor });
 const next = stream.next();
 const result = await next;
 expect(result.value).toMatchObject({id:43});
 expect(fetcher.mock.calls[1]![0]).toBe("/api/event-updates?after=42");
 expect(onCursor).toHaveBeenCalledWith(43);
 controller.abort();
 await stream.return();
});
