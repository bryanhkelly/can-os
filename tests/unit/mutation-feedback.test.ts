import { describe, expect, it, vi } from "vitest";
import { createMutationFeedbackRunner, type MutationFeedbackState } from "@/lib/mutation-feedback";

function createRunner() {
  let state: MutationFeedbackState = {
    pending: false,
    error: "",
    notice: "",
    refreshFailed: false,
  };
  const publish = vi.fn((next: MutationFeedbackState) => { state = next; });
  return { runner: createMutationFeedbackRunner(publish), publish, getState: () => state };
}

describe("mutation feedback", () => {
  it("reports command failures without refreshing", async () => {
    const { runner, getState } = createRunner();
    const refresh = vi.fn();
    const outcome = await runner.run(
      async () => { throw Object.assign(new Error("not for the client"), { code: "CONFLICT" }); },
      { fallback: "Unable to save.", success: "Saved.", refresh },
    );

    expect(outcome).toEqual({ status: "failed" });
    expect(refresh).not.toHaveBeenCalled();
    expect(getState()).toMatchObject({
      pending: false,
      error: "This item changed. Refresh and try again.",
      notice: "",
      refreshFailed: false,
    });
  });

  it("blocks repeated submissions while a command is pending", async () => {
    const { runner } = createRunner();
    let finish!: (value: string) => void;
    const command = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));

    const first = runner.run(command, { fallback: "Unable to save." });
    await expect(runner.run(command, { fallback: "Unable to save." }))
      .resolves.toEqual({ status: "duplicate" });
    expect(command).toHaveBeenCalledTimes(1);

    finish("saved value");
    await expect(first).resolves.toEqual({ status: "saved", value: "saved value" });
  });

  it("reports a saved command separately when refresh fails", async () => {
    const { runner, getState } = createRunner();
    const refresh = vi.fn().mockRejectedValue(new Error("private diagnostic"));
    const command = vi.fn().mockResolvedValue("saved value");

    const outcome = await runner.run(command, {
      fallback: "Unable to save.",
      success: "Record saved.",
      refresh,
    });

    expect(outcome).toEqual({ status: "refresh-failed", value: "saved value" });
    expect(command).toHaveBeenCalledTimes(1);
    expect(getState()).toEqual({
      pending: false,
      error: "The command succeeded, but the page could not refresh: the latest information could not be loaded. Refresh the page to see the latest information.",
      notice: "Record saved.",
      refreshFailed: true,
    });
    expect(getState().error).not.toContain("private diagnostic");

    const retry = vi.fn().mockResolvedValue("duplicate save");
    await expect(runner.run(retry, { fallback: "Unable to save." }))
      .resolves.toEqual({ status: "refresh-required" });
    expect(retry).not.toHaveBeenCalled();
  });
});
