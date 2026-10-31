import { describe, expect, it, vi } from "vitest";
import {
  assertPublishedFamilyInvitationDestination,
  assertPreopeningFamilyInterestDestination,
  familyInvitationBatchMetadataSchema,
  dedupeFamilyInvitationContacts,
  FAMILY_INVITATION_BATCH_KIND,
  familyInvitationRetryMatches,
  familyInvitationSendInput,
  parseFamilyInvitationRecipients,
  processFamilyInvitationRecipients,
  type FamilyInvitationBatchMetadata,
  type FamilyInvitationRecipient,
} from "@/domain/family-invitations";

const keyOne = "11111111-1111-4111-8111-111111111111";
const keyTwo = "22222222-2222-4222-8222-222222222222";
const requestOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function recipient(overrides: Partial<FamilyInvitationRecipient> = {}): FamilyInvitationRecipient {
  return {
    key: keyOne,
    firstName: "First",
    lastName: "Family",
    email: "first@example.test",
    status: "queued",
    attempts: 0,
    ...overrides,
  };
}

function metadata(): FamilyInvitationBatchMetadata {
  return {
    kind: FAMILY_INVITATION_BATCH_KIND,
    version: 1,
    batchRequestId: requestOne,
    siteSlug: "school",
    introduction: "Welcome",
    status: "queued",
    recipients: [recipient()],
  };
}

describe("family invitation recipient review", () => {
  it("parses and deduplicates a 50-recipient paste without dropping valid rows", () => {
    const rows = Array.from({ length: 50 }, (_, index) => `Family ${index},family${index}@example.test`);
    const parsed = parseFamilyInvitationRecipients([...rows, "FAMILY0@example.test"].join("\n"));
    expect(parsed.contacts).toHaveLength(50);
    expect(parsed.contacts[49]).toMatchObject({ firstName: "Family", lastName: "49", email: "family49@example.test" });
    expect(parsed.duplicates).toBe(1);
  });

  it("rejects more than 50 valid recipients before persistence", () => {
    const raw = Array.from({ length: 51 }, (_, index) => `family${index}@example.test`).join("\n");
    expect(() => parseFamilyInvitationRecipients(raw)).toThrow("limited to 50 recipients");
  });

  it("deduplicates against earlier invitations case-insensitively", () => {
    const contacts = [{ email: "new@example.test" }, { email: "existing@example.test" }];
    expect(dedupeFamilyInvitationContacts(contacts, new Set(["EXISTING@example.test"])))
      .toEqual([{ email: "new@example.test" }]);
  });

  it("accepts only an identical batch retry and rejects changed reviewed content", () => {
    const saved = metadata();
    const contacts = saved.recipients.map(({ firstName, lastName, email }) => ({ firstName, lastName, email }));
    expect(familyInvitationRetryMatches(saved, "Welcome families", "Welcome", contacts)).toBe(true);
    expect(familyInvitationRetryMatches(saved, "Welcome families", "Changed", contacts)).toBe(false);
    expect(familyInvitationRetryMatches(saved, "Welcome families", "Welcome", [])).toBe(false);
    expect(familyInvitationSendInput.safeParse({
      requestId: requestOne,
      programId: keyTwo,
      rawContacts: "first@example.test",
      subject: "Welcome",
      introduction: "Welcome",
      confirmed: false,
    }).success).toBe(false);
  });
});

describe("family invitation outbox retry and status behavior", () => {
  it("persists provider acceptance separately, retries failures, and skips accepted recipients", async () => {
    const first = recipient();
    const second = recipient({ key: keyTwo, email: "second@example.test" });
    const updates: Array<{ key: string; status: string; attempts: number }> = [];
    const send = vi.fn(async (entry: FamilyInvitationRecipient) => {
      if (entry.key === keyTwo) throw new Error("synthetic provider failure");
      return { requestId: requestOne, created: true };
    });
    const persist = vi.fn(async (key: string, update: { status: string; attempts: number }) => {
      updates.push({ key, ...update });
    });

    await expect(processFamilyInvitationRecipients([first, second], send, persist)).resolves.toBe(1);
    expect(updates).toEqual([
      { key: keyOne, status: "accepted", attempts: 1, requestId: requestOne },
      { key: keyTwo, status: "failed", attempts: 1, lastError: "provider_failed" },
    ]);

    send.mockReset();
    send.mockResolvedValue({ requestId: requestOne, created: true });
    const retry = [
      recipient({ status: "accepted", attempts: 1, requestId: requestOne }),
      recipient({ key: keyTwo, email: "second@example.test", status: "failed", attempts: 1 }),
    ];
    await expect(processFamilyInvitationRecipients(retry, send, persist)).resolves.toBe(0);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].key).toBe(keyTwo);
    expect(updates.at(-1)).toMatchObject({ key: keyTwo, status: "accepted", attempts: 2 });
  });

  it("leaves a cooldown recipient retryable instead of claiming provider acceptance", async () => {
    const persist = vi.fn();
    const failures = await processFamilyInvitationRecipients(
      [recipient()],
      async () => ({ requestId: requestOne, created: false }),
      persist,
    );
    expect(failures).toBe(1);
    expect(persist).toHaveBeenCalledWith(keyOne, expect.objectContaining({
      status: "failed", lastError: "cooldown", attempts: 1,
    }));
  });
});

describe("published family invitation destination", () => {
  const published = {
    type: "full_school" as const,
    status: "active",
    programSiteId: "site",
    programOrganizationId: "organization",
    siteOrganizationId: "organization",
    publicationSiteId: "site",
  };

  it("accepts only an active academic Program at the same published Site", () => {
    expect(() => assertPublishedFamilyInvitationDestination(published)).not.toThrow();
  });

  it.each([
    { status: "launching" },
    { status: "closed" },
    { programSiteId: null },
    { publicationSiteId: "another-site" },
    { siteOrganizationId: "another-organization" },
    { type: "summer_enrichment" as const },
  ])("rejects an unavailable or misleading destination: %j", override => {
    expect(() => assertPublishedFamilyInvitationDestination({ ...published, ...override }))
      .toThrow("School applications not open");
  });
});

describe("pre-opening family interest is not an application", () => {
  const proposed = {
    type: "full_school" as const,
    status: "launching",
    programSiteId: "church-site",
    siteId: "church-site",
    programOrganizationId: "church",
    siteOrganizationId: "church",
  };

  it("permits informational outreach for a proposed academic school only", () => {
    expect(() => assertPreopeningFamilyInterestDestination(proposed)).not.toThrow();
    expect(familyInvitationSendInput.parse({
      requestId: requestOne, programId: keyTwo,
      rawContacts: "first@example.test", subject: "School launch",
      introduction: "Our school is preparing", confirmed: true,
      purpose: "interest",
    }).purpose).toBe("interest");
  });

  it.each([
    {status: "active"},
    {status: "closed"},
    {type: "summer_enrichment" as const},
    {siteId: "different-site"},
    {siteOrganizationId: "different-church"},
    {programSiteId: null},
  ])("denies unapproved or mis-scoped outreach destination: %j", override => {
    expect(() => assertPreopeningFamilyInterestDestination({ ...proposed, ...override }))
      .toThrow("not eligible for pre-opening");
  });

  it("persists original purpose and forbids replaying interest as an application", () => {
    const batch: FamilyInvitationBatchMetadata = {
      ...metadata(), siteId: keyTwo, destination: "preopening_interest",
    };
    const contacts = batch.recipients.map(({firstName,lastName,email}) => ({firstName,lastName,email}));
    expect(familyInvitationBatchMetadataSchema.parse(batch).destination).toBe("preopening_interest");
    expect(familyInvitationRetryMatches(batch,"Proposed school","Welcome",contacts,"interest")).toBe(true);
    expect(familyInvitationRetryMatches(batch,"Proposed school","Welcome",contacts,"application")).toBe(false);
    expect(familyInvitationBatchMetadataSchema.safeParse({
      ...batch, siteId: undefined,
    }).success).toBe(false);
  });
});
