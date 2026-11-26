import { describe, expect, it } from "vitest";
import {
  campaignMaxAttempts, campaignOwnerScope, campaignProviderFailure,
  campaignRecipientLimit, campaignRetryable, campaignRetryAfterMs,
  campaignRetryWindowMs, parseCampaignRecipients,
} from "@/domain/campaign-policy";

describe("campaign policy", () => {
  it("normalizes and deduplicates addresses", () => {
    expect(parseCampaignRecipients("A@real.org a@real.org").recipients).toEqual(["a@real.org"]);
    expect(parseCampaignRecipients("fake@school.demo x@example.com").invalid).toEqual(["x@example.com"]);
  });

  it("marks invalid input without silently losing addresses", () => {
    const result = parseCampaignRecipients("A@real.org;bad, x@example.com a..b@real.org");
    expect(result.recipients).toEqual(["a@real.org", "bad", "x@example.com", "a..b@real.org"]);
    expect(result.invalid).toEqual(["bad", "x@example.com", "a..b@real.org"]);
  });

  it("applies the limit after deduplication", () => {
    const recipients = Array.from({ length: campaignRecipientLimit }, (_, index) => "a" + index + "@real.org");
    expect(parseCampaignRecipients(recipients.join(" ") + " " + recipients[0]).tooMany).toBe(false);
    expect(parseCampaignRecipients(recipients.join(" ") + " another@real.org").tooMany).toBe(true);
  });

  it("does not share contact lists across owner boundaries", () => {
    const org = campaignOwnerScope({ ownerKind: "organization", organizationId: "org", siteId: null, programId: null });
    const site = campaignOwnerScope({ ownerKind: "site", organizationId: "org", siteId: "site", programId: null });
    expect(org.ownerScope).not.toBe(site.ownerScope);
    expect(org.senderScope).toBe(site.senderScope);
  });

  it("bounds retries inside the provider idempotency window", () => {
    expect(campaignRetryable(3, new Date(0), 1000)).toBe(true);
    expect(campaignRetryable(4, new Date(0), 1000)).toBe(false);
    expect(campaignRetryable(1, new Date(0), 21 * 3600000)).toBe(false);
    expect(campaignRetryable(campaignMaxAttempts - 1, new Date(0), campaignRetryWindowMs - 1)).toBe(true);
    expect(campaignRetryable(campaignMaxAttempts - 1, new Date(0), campaignRetryWindowMs)).toBe(false);
  });

  it.each<[number, boolean, boolean, boolean]>([
    [400, false, false, false],
    [401, false, false, false],
    [408, true, true, false],
    [409, true, true, false],
    [422, false, false, false],
    [429, true, false, true],
    [500, true, true, true],
    [503, true, true, true],
  ])("preserves provider outcome policy for HTTP %i", (status, retryable, outcomeUnconfirmed, stopBatch) => {
    expect(campaignProviderFailure(status)).toEqual({ retryable, outcomeUnconfirmed, stopBatch });
  });

  it("bounds Retry-After values and handles both supported formats", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    expect(campaignRetryAfterMs(null, now)).toBe(0);
    expect(campaignRetryAfterMs("invalid", now)).toBe(0);
    expect(campaignRetryAfterMs("10", now)).toBe(10_000);
    expect(campaignRetryAfterMs("Wed, 25 Nov 2026 00:00:20 GMT", now)).toBe(20_000);
    expect(campaignRetryAfterMs("Tue, 24 Nov 2026 00:00:00 GMT", now)).toBe(0);
    expect(campaignRetryAfterMs("999999", now)).toBe(campaignRetryWindowMs);
  });
});
