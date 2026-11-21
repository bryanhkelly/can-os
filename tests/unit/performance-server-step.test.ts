import { afterEach, describe, expect, it, vi } from "vitest";
import { measureServerStep } from "@/lib/performance/measure-server-step";

const previousTrace = process.env.CAN_PERF_TRACE;

afterEach(() => {
  if (previousTrace === undefined) delete process.env.CAN_PERF_TRACE;
  else process.env.CAN_PERF_TRACE = previousTrace;
  vi.restoreAllMocks();
});

describe("opt-in server performance trace", () => {
  it("does not log or change results when disabled", async () => {
    delete process.env.CAN_PERF_TRACE;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const value = await measureServerStep("launch.site", "site-options", async () => ({ ok: true }));
    expect(value).toEqual({ ok: true });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs only the fixed route/step and duration when enabled", async () => {
    process.env.CAN_PERF_TRACE = "1";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await measureServerStep("operations.home", "actions", async () => 42)).toBe(42);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("[can-perf]");
    const entry = JSON.parse(String(log.mock.calls[0]?.[1])) as Record<string, unknown>;
    expect(entry).toMatchObject({ route: "operations.home", step: "actions", status: "ok" });
    expect(entry.elapsedMs).toEqual(expect.any(Number));
    expect(Object.keys(entry).sort()).toEqual(["elapsedMs", "route", "status", "step"]);
  });

  it("preserves the original error while recording a failed step", async () => {
    process.env.CAN_PERF_TRACE = "1";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const expected = new Error("internal test error");
    await expect(measureServerStep("launch.site", "overview-brand", async () => {
      throw expected;
    })).rejects.toBe(expected);
    const entry = JSON.parse(String(log.mock.calls[0]?.[1])) as Record<string, unknown>;
    expect(entry.status).toBe("error");
    expect(JSON.stringify(entry)).not.toContain("internal test error");
  });
});
