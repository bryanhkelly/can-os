import { describe, expect, it, vi } from "vitest";
import { getOrCreateAnnouncementAttempt, wasAnnouncementAccepted } from "../../src/domain/class-announcement-attempt";

describe("class announcement idempotency", () => {
  it("keeps both original UUID and original content across edits and a timeout", () => {
    const makeId = vi.fn(() => "01b44306-38aa-4cc7-bf74-8799d865474a");
    const first = getOrCreateAnnouncementAttempt(null, {
      title: " Original post ", body: " Original content ",
    }, makeId);
    const retry = getOrCreateAnnouncementAttempt(first, {
      title: "Edited after timeout", body: "Changed after timeout",
    }, makeId);
    expect(retry).toBe(first);
    expect(retry).toEqual({
      id: "01b44306-38aa-4cc7-bf74-8799d865474a",
      title: "Original post", body: "Original content",
    });
    expect(makeId).toHaveBeenCalledTimes(1);
  });

  it("does not discard uncertain attempts until the command is acknowledged", () => {
    expect(wasAnnouncementAccepted("failed")).toBe(false);
    expect(wasAnnouncementAccepted("duplicate")).toBe(false);
    expect(wasAnnouncementAccepted("refresh-required")).toBe(false);
    expect(wasAnnouncementAccepted("saved")).toBe(true);
    expect(wasAnnouncementAccepted("refresh-failed")).toBe(true);
  });
});
