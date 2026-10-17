import type { StoredEvent } from "./types";

/** Short HTTP requests avoid exhausting HTTP/1.1 connections across browser tabs. */
export async function* pollEvents(options: {
  signal: AbortSignal;
  after?: number;
  onCursor?: (cursor: number) => void;
  onOpen?: () => void;
  onReconnect?: (info: { error: Error }) => void;
}): AsyncGenerator<StoredEvent> {
  let cursor = options.after;
  while (!options.signal.aborted) {
    let caughtUp = true;
    try {
      const response = await fetch(`/api/event-updates${cursor === undefined ? "" : `?after=${cursor}`}`, {
        cache: "no-store",
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error(`Event updates failed (HTTP ${response.status}).`);
      const result = await response.json() as { events: StoredEvent[]; cursor: number };
      options.onOpen?.();
      for (const event of result.events) {
        if (options.signal.aborted) return;
        cursor = event.id;
        options.onCursor?.(cursor);
        yield event;
      }
      cursor = result.cursor;
      options.onCursor?.(cursor);
      caughtUp = result.events.length < 500;
    } catch (error) {
      if (options.signal.aborted) return;
      options.onReconnect?.({ error: error instanceof Error ? error : new Error(String(error)) });
    }
    if (caughtUp && !options.signal.aborted) {
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); options.signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, 1500);
        options.signal.addEventListener("abort", finish, { once: true });
        if (options.signal.aborted) finish();
      });
    }
  }
}
