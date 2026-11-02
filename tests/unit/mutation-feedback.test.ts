import { describe, expect, it, vi } from "vitest";
import {
  createMutationRunner,
  type MutationFeedbackState,
} from "@/lib/mutation-feedback";

const successMessage = "The change was saved.";
const commandErrorMessage = "Unable to save the change.";

function createHarness(refresh: () => Promise<unknown> = async () => undefined) {
  let state: MutationFeedbackState = {
    pending: false,
    error: "",
    notice: "",
    refreshFailed: false,
  };
  const run = createMutationRunner({ refresh, update: next => { state = next; } });
  return { run, get state() { return state; } };
}

describe("mutation feedback", () => {
  it("reports a command failure without refreshing", async () => {
    const refresh = vi.fn(async () => undefined);
    const harness = createHarness(refresh);
    const result = await harness.run(
      async () => { throw new Error("Permission denied."); },
      { successMessage, commandErrorMessage },
    );

    expect(result).toEqual({ status: "failed", error: new Error("Permission denied.") });
    expect(refresh).not.toHaveBeenCalled();
    expect(harness.state).toEqual({
      pending: false,
      error: commandErrorMessage,
      notice: "",
      refreshFailed: false,
    });
  });

  it("prevents a second command while the first is in flight", async () => {
    let finish!: (value: string) => void;
    const command = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const harness = createHarness();
    const first = harness.run(command, { successMessage, commandErrorMessage });
    const second = await harness.run(command, { successMessage, commandErrorMessage });

    expect(second).toEqual({ status: "duplicate" });
    expect(command).toHaveBeenCalledTimes(1);
    finish("saved");
    await expect(first).resolves.toEqual({ status: "saved", value: "saved" });
  });

  it("keeps the successful command result and blocks retries when refresh fails", async () => {
    const refresh = vi.fn(async () => { throw new Error("Internal router detail."); });
    const command = vi.fn(async () => "saved");
    const harness = createHarness(refresh);
    const result = await harness.run(command, {
      successMessage,
      commandErrorMessage,
      refreshErrorMessage: "Saved, but the page could not refresh.",
    });

    expect(result).toEqual({ status: "refresh-failed", value: "saved" });
    expect(harness.state).toEqual({
      pending: false,
      error: "Saved, but the page could not refresh.",
      notice: successMessage,
      refreshFailed: true,
    });
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({
      status: "refresh-required",
    });
    expect(command).toHaveBeenCalledTimes(1);
  });
});
