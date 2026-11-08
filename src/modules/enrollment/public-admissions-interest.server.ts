import { createHmac } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, communicationThreads, programPublications, programs, publicAdmissionsInterests,
  sitePublications, sites,
} from "@/db/schema";
import { isAcademicMarketingType, publishableAcademicProgram } from "@/domain/academic-program-publication";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { familyInvitationBatchMetadataSchema, isFamilyInvitationExpired } from "@/domain/family-invitations";
import { invitedFamilyInterestInput, type InvitedFamilyInterestInput } from "@/domain/family-recruitment-interest";
import { publicAdmissionsInterestInput, publicInterestMessage, publicInterestRateLimitKeys, type PublicInterestRoute, type PublicAdmissionsInterestInput } from "@/domain/public-admissions-interest";
import { isPublicSiteSlug } from "@/domain/public-site-address";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
const PER_SITE_BUDGET = 30;
const GLOBAL_EMERGENCY_BUDGET = 600;
const INVITATION_BUDGET = 120;
/** Atomic shared emergency ceiling plus independently scoped school limits.
 * An attack against one school must not exhaust all other schools' 30/minute
 * capacity. The platform ceiling is retained for extreme traffic; trusted-edge
 * bot protection remains required for a public deployment.
 */
export async function admitPublicAdmissionsInterest(
  route: PublicInterestRoute = "invited_family_interest",
  siteSlug?: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (route !== "invited_family_interest" && !siteSlug)
    throw new Error("Published Site identity is required for public admissions throttling");
  let siteId: string | undefined;
  if (siteSlug) {
    if (!isPublicSiteSlug(siteSlug))
      throw new Error("Unrecognized public school origin");
    const [published] = await db.select({siteId:sitePublications.siteId})
      .from(sitePublications).where(and(
        eq(sitePublications.slug,siteSlug),
        eq(sitePublications.status,"published"),
        isNotNull(sitePublications.publishedAt),
      )).limit(1);
    if (!published) throw new Error("School page not available");
    siteId = published.siteId;
  }
  const keys = publicInterestRateLimitKeys(route, siteId);
  return db.transaction(async tx => {
    async function charge(key: string, limit: number) {
      const result = await tx.execute(sql`
        INSERT INTO auth_request_rate_limits AS bucket
          (route, window_started_at, request_count)
        VALUES (${key}, now(), 1)
        ON CONFLICT (route) DO UPDATE SET
          request_count = CASE
            WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN 1
            ELSE LEAST(bucket.request_count + 1, ${limit + 1})
          END,
          window_started_at = CASE
            WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN now()
            ELSE bucket.window_started_at
          END
        RETURNING request_count <= ${limit} AS allowed,
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM
            (window_started_at + interval '60 seconds' - now())))::integer)
            AS "retryAfterSeconds"
      `);
      const row = result.rows[0] as {allowed?:unknown;retryAfterSeconds?:unknown}|undefined;
      if (typeof row?.allowed !== "boolean" || typeof row.retryAfterSeconds !== "number")
        throw new Error("Inquiry admission budget unavailable");
      return {allowed:row.allowed,retryAfterSeconds:
        row.allowed ? 0 : Math.max(1,Math.min(60,Math.ceil(row.retryAfterSeconds)))};
    }
    const emergency = await charge(keys.emergency,
      route === "invited_family_interest" ? INVITATION_BUDGET :
        route === "interest_event" ? INVITATION_BUDGET : GLOBAL_EMERGENCY_BUDGET);
    if (!emergency.allowed || !keys.site) return emergency;
    return charge(keys.site,PER_SITE_BUDGET);
  });
}

/** A public visitor may express interest but cannot create an Application,
 * Person, Household, enrollment, or guardian account/grant. */
export async function recordPublicAdmissionsInterest(
  slug: string,
  input: PublicAdmissionsInterestInput,
): Promise<void> {
  if (!isPublicSiteSlug(slug)) throw new Error("This Site is not accepting inquiries");
  const data = publicAdmissionsInterestInput.parse(input);
  if (data.website.trim()) return; // Bot honeypot; do not write contact records.
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Inquiry security is unavailable");
  return db.transaction(async tx => {
    const [matched] = await tx.select({
      siteId: sites.id,
      organizationId: sites.organizationId,
      programSiteId: programs.siteId,
      programOrganizationId: programs.organizationId,
      type: programs.type,
      status: programs.status,
    }).from(sitePublications)
      .innerJoin(sites, eq(sites.id, sitePublications.siteId))
      .innerJoin(programPublications, and(
        eq(programPublications.siteId, sites.id),
        eq(programPublications.programId, input.programId),
      ))
      .innerJoin(programs, eq(programs.id, programPublications.programId))
      .where(and(
        eq(sitePublications.slug, slug),
        eq(sitePublications.status, "published"),
        isNotNull(sitePublications.publishedAt),
        eq(programPublications.status, "published"),
        isNotNull(programPublications.publishedAt),
        inArray(programs.status, ["draft", "launching", "ready", "active"]),
      )).for("share", { of: sitePublications }).limit(1);

    if (!matched || !publishableAcademicProgram({
      type: matched.type,
      status: matched.status,
      siteId: matched.programSiteId,
      publicationSiteId: matched.siteId,
      organizationId: matched.programOrganizationId,
      siteOrganizationId: matched.organizationId,
    })) throw new Error("This Program is not accepting inquiries");

    const emailDigest = createHmac("sha256", pepper)
      .update(matched.siteId).update(":").update(input.programId)
      .update(":").update(data.email).digest("hex");

    // Serialize repeat interest for the same Site/Program/contact across
    // independent one-time form request IDs. Do not create a duplicate inbox.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${emailDigest}))`);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await tx.select({ id: publicAdmissionsInterests.id })
      .from(publicAdmissionsInterests).where(and(
        eq(publicAdmissionsInterests.programId, input.programId),
        eq(publicAdmissionsInterests.emailDigest, emailDigest),
        gt(publicAdmissionsInterests.createdAt, cutoff),
        // A school visit request should not be swallowed by an ordinary
        // information request made by the same parent earlier that day.
        data.purpose === "visit_interest"
          ? sql`${publicAdmissionsInterests.message} LIKE 'School visit interest (not scheduled)%'`
          : sql`${publicAdmissionsInterests.message} NOT LIKE 'School visit interest (not scheduled)%'`,
      )).orderBy(desc(publicAdmissionsInterests.createdAt)).limit(1);
    if (recent) return;

    const [created] = await tx.insert(publicAdmissionsInterests).values({
      requestId: data.requestId,
      siteId: matched.siteId,
      programId: input.programId,
      contactFirstName: data.firstName,
      contactLastName: data.lastName,
      contactEmail: data.email,
      emailDigest,
      message: publicInterestMessage(data),
      source: "published_site",
      contactConsentAt: new Date(),
      status: "new",
    }).onConflictDoNothing().returning({ id: publicAdmissionsInterests.id });
    if (!created) return; // Retry with the same form request ID.

    // Canonical Action, NOT a second website task/CRM. A staff owner and
    // deadline require a separate authorized registrar decision; do not
    // fabricate an assignment or service-level promise from anonymous input.
    const [followup]=await tx.insert(actions).values({
      type:"public_admissions_interest_followup",
      subjectType:"public_admissions_interest",subjectId:created.id,
      title:data.purpose==="visit_interest"?"Follow up on visit interest":"Follow up on school information request",
      organizationId:matched.organizationId,siteId:matched.siteId,
      programId:data.programId,
      status:"open",priority:"normal",
      metadata:{source:"published_site",purpose:data.purpose},
    }).returning({id:actions.id});
    if(!followup)throw new Error("Unable to create admissions follow-up");
    await emitEvent(tx,{
      eventType:EventTypes.ActionCreated,aggregateType:"action",
      aggregateId:followup.id,siteId:matched.siteId,
      organizationId:matched.organizationId,programId:data.programId,
      payload:{type:"public_admissions_interest_followup",subjectId:created.id},
    });
    await writeAudit(tx,{
      action:"admissions.public_interest.followup_created",
      resourceType:"action",resourceId:followup.id,actorPersonId:null,
      scope:{siteId:matched.siteId,organizationId:matched.organizationId,
        programId:data.programId},
      after:{subjectType:"public_admissions_interest",subjectId:created.id,status:"open"},
      context:{anonymous:true},
    });

    // Events/audit intentionally never include a raw visitor name/email/note.
    await emitEvent(tx, {
      eventType: EventTypes.PublicAdmissionsInterestReceived,
      aggregateType: "public_admissions_interest",
      aggregateId: created.id,
      siteId: matched.siteId,
      organizationId: matched.organizationId,
      programId: input.programId,
      payload: { source: "published_site", status: "new", purpose:data.purpose },
    });
    await writeAudit(tx, {
      action: "admissions.public_interest.receive",
      resourceType: "public_admissions_interest",
      resourceId: created.id,
      actorPersonId: null,
      scope: { siteId: matched.siteId, organizationId: matched.organizationId,
        programId: input.programId },
      after: { status: "new", source: "published_site" },
      context: { anonymous: true },
    });
  });
}

/**
 * A recipient of a pre-opening invitation voluntarily requests follow-up.
 * Resolve the invitation's original Program and Site on the server; the
 * anonymous form cannot select a different school or assert staff consent.
 * This remains unverified contact data, never a Person or Application.
 */
export async function recordInvitedFamilyInterest(input: InvitedFamilyInterestInput): Promise<void> {
  const data = invitedFamilyInterestInput.parse(input);
  if (data.website.trim()) return;
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Inquiry security is unavailable");
  await db.transaction(async tx => {
    const [batch] = await tx.select({
      programId: communicationThreads.contextId,
      metadata: communicationThreads.metadata,
      createdAt: communicationThreads.createdAt,
    }).from(communicationThreads).where(and(
      eq(communicationThreads.id, data.invitationBatchId),
      eq(communicationThreads.contextType, "program"),
    )).for("share").limit(1);
    const metadata = familyInvitationBatchMetadataSchema.safeParse(batch?.metadata);
    if (!batch?.programId || !metadata.success ||
      metadata.data.destination !== "preopening_interest") {
      throw new AuthorizationError("pre-opening family invitation");
    }
    if (isFamilyInvitationExpired(batch.createdAt)) {
      throw new AuthorizationError("unexpired pre-opening family invitation");
    }
    const recipient = metadata.data.recipients.find(row => row.key === data.invitationRecipientKey);
    if (!recipient || normalizeAccessEmail(recipient.email) !== normalizeAccessEmail(data.email)) {
      throw new AuthorizationError("intended pre-opening family recipient");
    }
    const [school] = await tx.select({
      siteId: sites.id, organizationId: sites.organizationId,
      programSiteId: programs.siteId, programOrganizationId: programs.organizationId,
      type: programs.type, status: programs.status,
    }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
      .where(eq(programs.id, batch.programId))
      .for("share", { of: [programs, sites] }).limit(1);
    // Preserve a response to a valid pre-opening invitation when the Program
    // has since opened; never use that historical invitation to open admissions.
    if (!school || school.siteId !== metadata.data.siteId ||
      school.programSiteId !== school.siteId ||
      school.organizationId !== school.programOrganizationId ||
      !isAcademicMarketingType(school.type) ||
      !["draft", "launching", "ready", "active"].includes(school.status)) {
      throw new AuthorizationError("available pre-opening family Program");
    }
    const digest = createHmac("sha256", pepper)
      .update(school.siteId).update(":").update(batch.programId)
      .update(":").update(data.email).digest("hex");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.invitationRecipientKey}))`);
    const [prior] = await tx.select({
      id: publicAdmissionsInterests.id,
      message: publicAdmissionsInterests.message,
      contactConsentAt: publicAdmissionsInterests.contactConsentAt,
    }).from(publicAdmissionsInterests).where(and(
      eq(publicAdmissionsInterests.invitationBatchId, data.invitationBatchId),
      eq(publicAdmissionsInterests.invitationRecipientKey, data.invitationRecipientKey),
    )).limit(1);
    const followUpAllowed = data.responseKind !== "survey" || data.contactPreference !== "none";
    if (prior) {
      if (data.responseKind !== "survey") return;
      const currentMessage = [prior.message, data.message].filter(Boolean).join("\n").slice(0,500);
      const consentChanged = Boolean(prior.contactConsentAt) !== followUpAllowed;
      if (currentMessage === prior.message && !consentChanged) return;
      await tx.update(publicAdmissionsInterests).set({
        message: currentMessage,
        contactConsentAt: followUpAllowed ? prior.contactConsentAt ?? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(publicAdmissionsInterests.id, prior.id));
      if (!followUpAllowed) {
        await tx.update(actions).set({status:"resolved"}).where(and(
          eq(actions.subjectType,"public_admissions_interest"),
          eq(actions.subjectId,prior.id),
          eq(actions.type,"public_admissions_interest_followup"),
          eq(actions.status,"open"),
        ));
      } else if (!prior.contactConsentAt) {
        // A family can opt in after a prior no-contact survey. Create the
        // canonical follow-up only once under the recipient advisory lock.
        const [existingAction] = await tx.select({id:actions.id,status:actions.status}).from(actions)
          .where(and(eq(actions.subjectType,"public_admissions_interest"),
            eq(actions.subjectId,prior.id),
            eq(actions.type,"public_admissions_interest_followup"))).limit(1);
        if (existingAction && existingAction.status==="resolved") {
          await tx.update(actions).set({status:"open"}).where(eq(actions.id,existingAction.id));
        }
        if (!existingAction) {
          const [newAction] = await tx.insert(actions).values({
            type:"public_admissions_interest_followup",
            subjectType:"public_admissions_interest",subjectId:prior.id,
            title:"Follow up on invited family interest",
            organizationId:school.organizationId,siteId:school.siteId,programId:batch.programId,
            status:"open",priority:"normal",metadata:{source:"staff_invitation"},
          }).returning({id:actions.id});
          if (!newAction) throw new Error("Unable to create school follow-up");
          await emitEvent(tx,{
            eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:newAction.id,
            siteId:school.siteId,organizationId:school.organizationId,programId:batch.programId,
            payload:{type:"public_admissions_interest_followup",subjectId:prior.id},
          });
        }
      }
      await writeAudit(tx,{
        action:"admissions.invited_interest.survey_received",
        resourceType:"public_admissions_interest",resourceId:prior.id,
        actorPersonId:null,scope:{siteId:school.siteId,organizationId:school.organizationId,
          programId:batch.programId},
        after:{surveyRecorded:true,contactConsent:followUpAllowed?"affirmative":"withdrawn"},
        context:{anonymous:true},
      });
      return;
    }
    const now = new Date();
    const [created] = await tx.insert(publicAdmissionsInterests).values({
      requestId: data.requestId,
      siteId: school.siteId, programId: batch.programId,
      contactFirstName: data.firstName, contactLastName: data.lastName,
      contactEmail: data.email, emailDigest: digest, message: data.message,
      source: "staff_invitation", contactConsentAt: followUpAllowed ? now : null,
      invitationBatchId: data.invitationBatchId,
      invitationRecipientKey: data.invitationRecipientKey,
      status: "new",
    }).onConflictDoNothing().returning({ id: publicAdmissionsInterests.id });
    if (!created) return;
    // An invited family's consented reply belongs in the same canonical
    // registrar follow-up queue as a public website inquiry. The invitation
    // itself is not consent to contact, and neither path creates an Application.
    if (followUpAllowed) {
    const [followup] = await tx.insert(actions).values({
      type: "public_admissions_interest_followup",
      subjectType: "public_admissions_interest",
      subjectId: created.id,
      title: "Follow up on invited family interest",
      organizationId: school.organizationId,
      siteId: school.siteId,
      programId: batch.programId,
      status: "open",
      priority: "normal",
      metadata: {
        source: "staff_invitation",
        invitationBatchId: data.invitationBatchId,
      },
    }).returning({ id: actions.id });
    if (!followup) throw new Error("Unable to create admissions follow-up");
    await emitEvent(tx, {
      eventType: EventTypes.ActionCreated,
      aggregateType: "action",
      aggregateId: followup.id,
      organizationId: school.organizationId,
      siteId: school.siteId,
      programId: batch.programId,
      payload: {
        type: "public_admissions_interest_followup",
        subjectId: created.id,
      },
    });
    await writeAudit(tx, {
      action: "admissions.invited_interest.followup_created",
      resourceType: "action",
      resourceId: followup.id,
      actorPersonId: null,
      scope: {
        organizationId: school.organizationId,
        siteId: school.siteId,
        programId: batch.programId,
      },
      after: {
        subjectType: "public_admissions_interest",
        subjectId: created.id,
        status: "open",
      },
      context: { anonymous: true },
    });
    }
    await emitEvent(tx, {
      eventType: EventTypes.PublicAdmissionsInterestReceived,
      aggregateType: "public_admissions_interest", aggregateId: created.id,
      siteId: school.siteId, organizationId: school.organizationId,
      programId: batch.programId,
      payload: { source: "staff_invitation", status: "new",
        invitationBatchId: data.invitationBatchId, invitationRecipientKey: data.invitationRecipientKey },
    });
    await writeAudit(tx, {
      action: "admissions.invited_interest.receive",
      resourceType: "public_admissions_interest", resourceId: created.id,
      actorPersonId: null,
      scope: { siteId: school.siteId, organizationId: school.organizationId,
        programId: batch.programId },
      after: { status: "new", source: "staff_invitation",
        invitationBatchId: data.invitationBatchId, invitationRecipientKey: data.invitationRecipientKey,
        contactConsent: followUpAllowed ? "affirmative" : "declined" },
      context: { anonymous: true },
    });
  });
}
