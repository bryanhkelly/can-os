import { z } from "zod";
import { publishableAcademicProgram } from "./academic-program-publication";
import { parseFamilyContacts } from "./family-contact-import";
import type { ProgramType } from "./program-offerings";

export const FAMILY_INVITATION_BATCH_KIND = "family_invitation_batch" as const;
export const FAMILY_INVITATION_MAX_RECIPIENTS = 50;

export const familyInvitationSendInput = z.object({
  requestId: z.string().uuid(),
  programId: z.string().uuid(),
  rawContacts: z.string().trim().min(1).max(20_000),
  subject: z.string().trim().min(3).max(120),
  introduction: z.string().trim().min(1).max(2_000),
  confirmed: z.literal(true),
}).strict();

export type FamilyInvitationSendInput = z.infer<typeof familyInvitationSendInput>;

export type FamilyInvitationRecipient = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "queued" | "accepted" | "failed";
  attempts: number;
  requestId?: string;
  lastError?: "provider_failed" | "cooldown";
  updatedAt?: string;
};

export type FamilyInvitationBatchMetadata = {
  kind: typeof FAMILY_INVITATION_BATCH_KIND;
  version: 1;
  batchRequestId: string;
  siteSlug: string;
  introduction: string;
  status: "queued" | "retrying" | "complete";
  recipients: FamilyInvitationRecipient[];
};

const recipientSchema: z.ZodType<FamilyInvitationRecipient> = z.object({
  key: z.string().uuid(),
  firstName: z.string().max(80),
  lastName: z.string().max(80),
  email: z.string().email().max(254),
  status: z.enum(["queued", "accepted", "failed"]),
  attempts: z.number().int().nonnegative(),
  requestId: z.string().uuid().optional(),
  lastError: z.enum(["provider_failed", "cooldown"]).optional(),
  updatedAt: z.string().optional(),
}).strict();

export const familyInvitationBatchMetadataSchema: z.ZodType<FamilyInvitationBatchMetadata> = z.object({
  kind: z.literal(FAMILY_INVITATION_BATCH_KIND),
  version: z.literal(1),
  batchRequestId: z.string().uuid(),
  siteSlug: z.string().min(1),
  introduction: z.string().min(1).max(2_000),
  status: z.enum(["queued", "retrying", "complete"]),
  recipients: z.array(recipientSchema).min(1).max(FAMILY_INVITATION_MAX_RECIPIENTS),
}).strict();

export function parseFamilyInvitationRecipients(rawContacts: string) {
  const parsed = parseFamilyContacts(rawContacts);
  if (parsed.contacts.length > FAMILY_INVITATION_MAX_RECIPIENTS) {
    throw new Error(`Family invitations are limited to ${FAMILY_INVITATION_MAX_RECIPIENTS} recipients per batch`);
  }
  return parsed;
}

export function dedupeFamilyInvitationContacts<T extends { email: string }>(
  contacts: readonly T[],
  existingEmails: ReadonlySet<string>,
): T[] {
  const normalized = new Set([...existingEmails].map(email => email.trim().toLowerCase()));
  return contacts.filter(contact => !normalized.has(contact.email.trim().toLowerCase()));
}

export function familyInvitationRetryMatches(
  metadata: FamilyInvitationBatchMetadata,
  subject: string,
  introduction: string,
  contacts: readonly { firstName: string; lastName: string; email: string }[],
): boolean {
  const saved = metadata.recipients.map(recipient => ({
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    email: recipient.email,
  }));
  return metadata.introduction === introduction && subject.length > 0 &&
    JSON.stringify(saved) === JSON.stringify(contacts);
}

/** The marketing and operating gates are independent; both are required. */
export function assertPublishedFamilyInvitationDestination(input: {
  type: ProgramType;
  status: string;
  programSiteId: string | null;
  programOrganizationId: string;
  siteOrganizationId: string;
  publicationSiteId: string;
}): void {
  if (input.status !== "active" || !publishableAcademicProgram({
    type: input.type,
    status: input.status,
    siteId: input.programSiteId,
    organizationId: input.programOrganizationId,
    siteOrganizationId: input.siteOrganizationId,
    publicationSiteId: input.publicationSiteId,
  })) {
    throw new Error("School applications not open");
  }
}

export type FamilyInvitationRecipientUpdate = {
  status: "accepted" | "failed";
  attempts: number;
  requestId?: string;
  lastError?: "provider_failed" | "cooldown";
};

/**
 * Provider calls stay outside database transactions. Each result is persisted
 * before the next recipient is attempted, so an outbox retry skips recipients
 * already accepted by the provider. `accepted` never means inbox delivery.
 */
export async function processFamilyInvitationRecipients(
  recipients: readonly FamilyInvitationRecipient[],
  send: (recipient: FamilyInvitationRecipient) => Promise<{ requestId: string; created: boolean }>,
  persist: (recipientKey: string, update: FamilyInvitationRecipientUpdate) => Promise<void>,
): Promise<number> {
  let failures = 0;
  for (const recipient of recipients) {
    if (recipient.status === "accepted") continue;
    try {
      const result = await send(recipient);
      if (!result.created) {
        failures += 1;
        await persist(recipient.key, {
          status: "failed",
          attempts: recipient.attempts + 1,
          lastError: "cooldown",
        });
        continue;
      }
      await persist(recipient.key, {
        status: "accepted",
        attempts: recipient.attempts + 1,
        requestId: result.requestId,
      });
    } catch {
      failures += 1;
      await persist(recipient.key, {
        status: "failed",
        attempts: recipient.attempts + 1,
        lastError: "provider_failed",
      });
    }
  }
  return failures;
}

export type FamilyInvitationWorkspace = {
  programs: Array<{
    id: string;
    name: string;
    siteId: string;
    publishedSiteUrl: string;
  }>;
  batches: Array<{
    id: string;
    programId: string;
    programName: string;
    subject: string;
    introduction: string;
    createdAt: string;
    status: "queued" | "retrying" | "complete";
    outboxStatus: "pending" | "processing" | "failed" | "processed" | null;
    recipients: Array<{
      firstName: string;
      lastName: string;
      email: string;
      status: "queued" | "provider_accepted" | "retrying" | "responded";
      attempts: number;
      respondedAt: string | null;
    }>;
  }>;
};
