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
  it.each([{ ok: false }, { isError: true }])("blocks further commands for a failed read outcome", async result => {
    const refresh = vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce({ ok: true });
    const command = vi.fn(async () => "saved");
    const harness = createHarness(refresh);
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({
      status: "refresh-failed", value: "saved",
    });
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({ status: "refresh-required" });
    expect(await harness.run.retryRefresh()).toEqual({ status: "refreshed" });
    expect(command).toHaveBeenCalledOnce();
  });
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

  it("retries only refresh, preserves confirmation, and unblocks after reconciliation", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const command = vi.fn(async () => "saved");
    const harness = createHarness(refresh);
    await harness.run(command, { successMessage, commandErrorMessage });
    expect(await harness.run.retryRefresh()).toEqual({ status: "refreshed" });
    expect(command).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(harness.state).toEqual({ pending: false, error: "", notice: successMessage, refreshFailed: false });
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({ status: "saved", value: "saved" });
  });

  it("keeps the block and saved notice if reconciliation fails again", async () => {
    const refresh = vi.fn(async () => { throw new Error("offline"); });
    const harness = createHarness(refresh);
    const command = vi.fn(async () => "saved");
    await harness.run(command, { successMessage, commandErrorMessage, refreshErrorMessage: "Refresh unavailable." });
    expect(await harness.run.retryRefresh()).toEqual({ status: "refresh-failed" });
    expect(harness.state).toEqual({
      pending: false, error: "Refresh unavailable.", notice: successMessage, refreshFailed: true,
    });
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({ status: "refresh-required" });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("prevents concurrent refreshes and commands during recovery", async () => {
    let finish!: () => void;
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const harness = createHarness(refresh);
    const command = vi.fn(async () => "saved");
    await harness.run(command, { successMessage, commandErrorMessage });
    const recovery = harness.run.retryRefresh();
    expect(harness.state).toEqual({ pending: true, error: "", notice: successMessage, refreshFailed: true });
    expect(await harness.run.retryRefresh()).toEqual({ status: "duplicate" });
    expect(await harness.run(command, { successMessage, commandErrorMessage })).toEqual({ status: "duplicate" });
    finish();
    expect(await recovery).toEqual({ status: "refreshed" });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("uses the failed operation's refresh override rather than a different refresh", async () => {
    const refresh = vi.fn(async () => undefined);
    const override = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const harness = createHarness(refresh);
    await harness.run(async () => "saved", { successMessage, commandErrorMessage, refresh: override });
    expect(await harness.run.retryRefresh()).toEqual({ status: "refreshed" });
    expect(override).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh before any saved command needs recovery or after a command failure", async () => {
    const refresh = vi.fn(async () => undefined);
    const harness = createHarness(refresh);
    expect(await harness.run.retryRefresh()).toEqual({ status: "not-required" });
    await harness.run(async () => { throw new Error("denied"); }, { successMessage, commandErrorMessage });
    expect(await harness.run.retryRefresh()).toEqual({ status: "not-required" });
    expect(refresh).not.toHaveBeenCalled();
  });
});
