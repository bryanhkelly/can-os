import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, auditEvents, people } from "@/db/schema";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { EventTypes } from "@/domain/event-types";
import { isDemoAccountEmail, isDemoTenantOrganization, LOCAL_DEMO_ACCESS_CODE } from "@/domain/local-demo-access";
import { publicIntakeProgram } from "@/modules/enrollment/public-intake.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { redeemDemoAccess, requestOneTimeAccess } from "./passwordless-access.server";
import { sendAccessLinkViaResend, type AccessEmailSender } from "./resend-access-mail.server";

export const applicantRegistration = z.object({
  programId: z.string().uuid(), firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254),
  code: z.string().optional(),
}).strict();

export async function registerApplicant(
  input: z.infer<typeof applicantRegistration>, sender: AccessEmailSender = sendAccessLinkViaResend,
) {
  const email = normalizeAccessEmail(input.email);
  const demo = isDemoAccountEmail(email);
  const program = await publicIntakeProgram(input.programId);
  if (demo) {
    if (!isDemoTenantOrganization(program.organizationId) ||
      input.code !== LOCAL_DEMO_ACCESS_CODE) throw new Error("Demo applicant access is unavailable or the code is invalid");
  } else {
    if (email.endsWith(".demo") || email.endsWith(".invalid") || isDemoTenantOrganization(program.organizationId))
      throw new Error("Use a @valorschool.demo address for Valor School; use a deliverable email for other schools");
    const origin = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    if (!origin || new URL(origin).protocol !== "https:" || !process.env.CAN_ACCESS_TOKEN_PEPPER ||
      process.env.CAN_ACCESS_TOKEN_PEPPER.length < 32 ||
      (sender === sendAccessLinkViaResend && (!process.env.RESEND_API_KEY || !process.env.CAN_ACCESS_FROM_EMAIL)))
      throw new Error("Applicant email verification is not configured. Contact the school.");
  }
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('can-os:applicant-registration'))`);
    const currentProgram = await publicIntakeProgram(input.programId, tx);
    if (currentProgram.organizationId !== program.organizationId || currentProgram.siteId !== program.siteId)
      throw new Error("This program's school changed. Reload before registering.");
    const [existing] = await tx.select({ id: accessAccounts.id }).from(accessAccounts)
      .where(eq(accessAccounts.emailNormalized, email)).limit(1);
    // Existing identity ownership must be established by its normal sign-in, not a signup form.
    if (existing) return;
    const [recent] = await tx.select({ count: sql<number>`count(*)::int` }).from(auditEvents)
      .where(and(eq(auditEvents.action, "identity.applicant.register"),
        gt(auditEvents.occurredAt, new Date(Date.now() - 60 * 60 * 1000))));
    if ((recent?.count ?? 0) >= 100) throw new Error("Applicant registration is temporarily busy. Please try again later.");
    const [person] = await tx.insert(people).values({
      legalFirstName: input.firstName, legalLastName: input.lastName, email,
    }).returning({ id: people.id });
    const [account] = await tx.insert(accessAccounts).values({ emailNormalized: email }).returning({ id: accessAccounts.id });
    if (!person || !account) throw new Error("Unable to create applicant access");
    await tx.insert(accountPersonGrants).values({
      accountId: account.id, personId: person.id, role: "applicant",
      organizationId: program.organizationId, siteId: program.siteId,
    });
    const scope = { organizationId: program.organizationId, siteId: program.siteId };
    await writeAudit(tx, { actorPersonId: null, action: "identity.applicant.register",
      resourceType: "account", resourceId: account.id, scope,
      after: { personId: person.id, role: "applicant" }, context: { method: demo ? "demo_code" : "pending_email_verification" } });
    await emitEvent(tx, { eventType: EventTypes.ApplicantRegistered, aggregateType: "account",
      aggregateId: account.id, ...scope, payload: { personId: person.id } });
  });
  if (demo) return redeemDemoAccess(email, input.code!);
  await requestOneTimeAccess(email, sender);
  return null;
}
