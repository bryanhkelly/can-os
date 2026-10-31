import { z } from "zod";
import { isAcademicMarketingType, publishableAcademicProgram } from "./academic-program-publication";
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
  /** Interest outreach does not grant application access before school approval. */
  purpose: z.enum(["interest", "application"]).default("application"),
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
  /** Absent on legacy published-website invitations. */
  destination?: "private_platform" | "preopening_interest";
  siteId?: string;
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
  destination: z.enum(["private_platform", "preopening_interest"]).optional(),
  siteId: z.string().uuid().optional(),
  introduction: z.string().min(1).max(2_000),
  status: z.enum(["queued", "retrying", "complete"]),
  recipients: z.array(recipientSchema).min(1).max(FAMILY_INVITATION_MAX_RECIPIENTS),
}).strict().refine(value=>!value.destination||Boolean(value.siteId),
  "Private invitations must retain their original Site");

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
  purpose: "interest" | "application" = "application",
): boolean {
  const saved = metadata.recipients.map(recipient => ({
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    email: recipient.email,
  }));
  return metadata.introduction === introduction && subject.length > 0 &&
    (metadata.destination === "preopening_interest" ? "interest" : "application") === purpose &&
    JSON.stringify(saved) === JSON.stringify(contacts);
}

/** A proposed school may contact families without activating admissions or asserting opening approval. */
export function assertPreopeningFamilyInterestDestination(input: {
  type: ProgramType;
  status: string;
  programSiteId: string | null;
  programOrganizationId: string;
  siteOrganizationId: string;
  siteId: string;
}): void {
  if (!["draft", "launching", "ready"].includes(input.status) ||
    !isAcademicMarketingType(input.type) || !input.programSiteId ||
    input.programSiteId !== input.siteId ||
    input.programOrganizationId !== input.siteOrganizationId) {
    throw new Error("School is not eligible for pre-opening family interest outreach");
  }
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
    privateApplicationUrl?: string;
    purpose: "interest" | "application";
  }>;
  batches: Array<{
    id: string;
    programId: string;
    siteId?: string | null;
    programName: string;
    subject: string;
    introduction: string;
    createdAt: string;
    status: "queued" | "retrying" | "complete";
    purpose: "interest" | "application";
    outboxStatus: "pending" | "processing" | "failed" | "processed" | null;
    recipients: Array<{
      firstName: string;
      lastName: string;
      email: string;
      status: "queued" | "provider_accepted" | "retrying" | "responded";
      attempts: number;
      respondedAt: string | null;
      /** A self-submitted, unverified adult interest request is separate from provider delivery. */
      interest: null | {
        id: string;
        source: string;
        status: string;
        requestedAt: string;
        consentedAt: string | null;
        contactedAt: string | null;
        verifiedEmailAt: string | null;
        applicationId: string | null;
        applicationStage: string | null;
        applicationSubmittedAt: string | null;
      };
    }>;
  }>;
};
