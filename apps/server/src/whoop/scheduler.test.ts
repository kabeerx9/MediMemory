import { afterEach, describe, expect, it, vi } from "vitest";

import { startWhoopScheduler } from "./scheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("startWhoopScheduler", () => {
  it("syncs every active connection at start and then on each interval, one at a time", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const sync = async (id: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
    };

    const stop = startWhoopScheduler({ intervalMs: 1000, listConnectionIds: async () => ["a", "b"], sync });
    await vi.advanceTimersByTimeAsync(50);
    expect(order).toEqual(["a", "b"]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual(["a", "b", "a", "b"]);
    expect(maxInFlight).toBe(1);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(order).toHaveLength(4);
  });

  it("keeps going when one connection's sync throws", async () => {
    vi.useFakeTimers();
    const done: string[] = [];
    const stop = startWhoopScheduler({
      intervalMs: 1000,
      listConnectionIds: async () => ["bad", "good"],
      sync: async (id) => {
        if (id === "bad") throw new Error("boom");
        done.push(id);
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toEqual(["good"]);
    stop();
  });
});
