import { describe, expect, it } from "vitest";
import {
  appendPublicInterestContact, publicInterestContactHistory,
  publicInterestOutcomeCloses, publicInterestOutcomeIsReached,
  type PublicInterestContactRecord,
} from "@/domain/public-interest-contact-history";

const record: PublicInterestContactRecord = {
  kind: "public_interest_contact",
  requestId: "00000000-0000-4000-8000-000000000001",
  actorPersonId: "00000000-0000-4000-8000-000000000002",
  outcome: "attempted",
  note: "Left a message",
  recordedAt: "2026-10-23T08:00:00.000Z",
  nextFollowUpAt: "2026-10-24T08:00:00.000Z",
};

describe("public school interest contact history", () => {
  it("keeps append-only contact outcomes on the canonical Action evidence", () => {
    const original = [{ kind: "unrelated_action_evidence", marker: true }];
    const first = appendPublicInterestContact(original, record);
    expect(first.changed).toBe(true);
    expect(original).toHaveLength(1);
    expect(first.evidence).toEqual([original[0], record]);
    expect(publicInterestContactHistory(first.evidence)).toEqual([record]);
  });

  it("is idempotent under an exact retry without duplicating evidence", () => {
    const first = appendPublicInterestContact([], record);
    const retried = appendPublicInterestContact(first.evidence, {
      ...record, recordedAt: "2026-10-26T08:00:00.000Z",
    });
    expect(retried.changed).toBe(false);
    expect(retried.evidence).toHaveLength(1);
  });

  it("rejects a reused request id with different outcome, note or deadline", () => {
    const evidence = [record];
    expect(() => appendPublicInterestContact(evidence,
      { ...record, outcome: "reached" })).toThrow(/reused/);
    expect(() => appendPublicInterestContact(evidence,
      { ...record, note: "changed" })).toThrow(/reused/);
    expect(() => appendPublicInterestContact(evidence,
      { ...record, nextFollowUpAt: null })).toThrow(/reused/);
  });

  it("filters untrusted/malformed historical Action evidence", () => {
    expect(publicInterestContactHistory([
      record, { ...record, kind: "different" },
      { ...record, outcome: "student_approved" },
      { ...record, actorPersonId: null },
      { ...record, note: 42 },
    ])).toEqual([record]);
  });

  it("distinguishes reached-family, declined-family and unfinished contact", () => {
    expect(publicInterestOutcomeIsReached("reached")).toBe(true);
    expect(publicInterestOutcomeIsReached("tour_requested")).toBe(true);
    expect(publicInterestOutcomeIsReached("attempted")).toBe(false);
    expect(publicInterestOutcomeIsReached("no_response")).toBe(false);
    expect(publicInterestOutcomeCloses("not_interested")).toBe(true);
    expect(publicInterestOutcomeCloses("reached")).toBe(false);
  });

  it("caps embedded evidence growth without erasing earlier history", () => {
    const original = Array.from({ length: 100 }, (_, i) => ({
      ...record, requestId: `attempt-${i}`,
    }));
    expect(() => appendPublicInterestContact(original, record)).toThrow(/limit/);
    expect(original).toHaveLength(100);
  });
});
