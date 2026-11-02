import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, documents, jurisdictions, people, programs, qualificationClaims, qualificationDefinitions,
  qualificationVerificationEvents, roleAssignments,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { credentialStatusFromDecision } from "@/domain/credential-workflow";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { requireActor, recordAudit, type Actor } from "@/modules/identity/actors.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { emitEvent } from "@/platform/mutation";
import { createPrivateUploadUrl, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";
import { assertScopedQualificationReviewer, reviewQualification } from "./qualification-review.server";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();
const selection = z.object({ personId: uuid.optional(), programId: uuid.optional() });
const keyPattern = /^qualifications\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
function assertUploadsEnabled() {
  if (process.env.CAN_R2_QUALIFICATION_UPLOADS_ENABLED !== "true") {
    throw new Error("Qualification evidence uploads are not enabled for this deployment");
  }
}
const upload = z.object({
  definitionId: uuid, issuerName: z.string().trim().min(1).max(200),
  jurisdictionId: uuid.optional(), issuedAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  fileName: z.string().trim().min(1).max(150),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size: z.number().int().min(16).max(10 * 1024 * 1024),
}).refine(value => !value.issuedAt || !value.expiresAt || new Date(value.issuedAt) < new Date(value.expiresAt),
  "Qualification expiry must follow issuance");

type Reader = Pick<typeof db, "select">;
const siteCredentialRoles=["room_facilitator","site_leader","site_staff"];
async function ownSiteStaff(actor:Actor,executor:Reader=db){
  if(!actor.actorPersonId || !actor.grantSiteId || !actor.grantId ||
     !siteCredentialRoles.includes(actor.role) || actor.sessionAccountId)
    throw new AuthorizationError("verified original onsite staff credential owner");
  assertCapability(actor,"profiles.credentials.submit");
  const [grant]=await executor.select({id:accountPersonGrants.id})
    .from(accountPersonGrants)
    .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
    .innerJoin(people,eq(people.id,accountPersonGrants.personId))
    .where(and(
      eq(accountPersonGrants.id,actor.grantId),
      eq(accountPersonGrants.accountId,actor.accountId),
      eq(accountPersonGrants.personId,actor.actorPersonId),
      eq(accountPersonGrants.role,actor.role),
      eq(accountPersonGrants.siteId,actor.grantSiteId),
      inArray(accountPersonGrants.organizationId,actor.scope.organizationIds??[]),
      eq(accountPersonGrants.active,true),
      eq(accessAccounts.disabled,false),eq(people.active,true),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    )).limit(1);
  if(!grant)throw new AuthorizationError("current verified onsite staff credential identity");
}
async function ownCredentialSubject(actor:Actor,tx:Reader=db){
  if(actor.role==="teacher")return ownTeacher(actor,tx);
  return ownSiteStaff(actor,tx);
}
async function ownTeacher(actor: Actor, executor: Reader = db) {
  assertCapability(actor, "profiles.credentials.submit");
  const [role] = await executor.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(eq(roleAssignments.personId, actor.actorPersonId), eq(people.active, true),
      eq(roleAssignments.roleKey, "teacher"),
      activeRoleAssignmentPredicate(),
      inArray(roleAssignments.organizationId, actor.scope.organizationIds ?? []),
      or(isNull(roleAssignments.siteId), inArray(roleAssignments.siteId, actor.scope.siteIds ?? [])),
      or(isNull(roleAssignments.programId), inArray(roleAssignments.programId, actor.scope.programIds ?? [])),
    )).limit(1);
  if (!role) throw new AuthorizationError("current teacher affiliation");
}

async function authorizedSubject(actor: Actor, input: z.infer<typeof selection>, executor: Reader = db) {
  const personId = input.personId ?? actor.actorPersonId;
  if (personId === actor.actorPersonId &&
      (actor.role === "teacher" || siteCredentialRoles.includes(actor.role))) {
    await ownCredentialSubject(actor, executor);
    return { personId, canSubmit: true };
  }
  if (actor.role !== "registrar" || !input.programId ||
    !actor.scope.programIds?.includes(input.programId)) throw new AuthorizationError("credential review program");
  assertCapability(actor, "profiles.credentials.verify");
  const [program] = await executor.select().from(programs).where(eq(programs.id, input.programId)).limit(1);
  if (!program || !actor.scope.organizationIds?.includes(program.organizationId) ||
    !program.siteId || !actor.scope.siteIds?.includes(program.siteId)) throw new AuthorizationError("credential review scope");
  const [teacher] = await executor.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(eq(roleAssignments.personId, personId), inArray(roleAssignments.roleKey,["teacher","room_facilitator","site_leader","site_staff"]), eq(people.active, true),
      activeRoleAssignmentPredicate(),
      inArray(roleAssignments.organizationId, [program.organizationId, program.academicProviderOrganizationId]),
      or(isNull(roleAssignments.siteId), eq(roleAssignments.siteId, program.siteId)),
      or(isNull(roleAssignments.programId), eq(roleAssignments.programId, program.id)))).limit(1);
  if (!teacher) throw new AuthorizationError("credential subject is not a teacher for this program");
  await assertScopedQualificationReviewer(actor, personId, executor);
  return { personId, canSubmit: false };
}

async function catalogEntry(data: z.infer<typeof upload>, executor: Reader = db, actor?:Actor) {
  const [definition] = await executor.select().from(qualificationDefinitions)
    .where(eq(qualificationDefinitions.id, data.definitionId)).limit(1);
  if (!definition) throw new Error("Qualification catalog entry is unavailable");
  if(actor && siteCredentialRoles.includes(actor.role) &&
     !["onsite_child_safety_screening","onsite_safeguarding_training"].includes(definition.key))
    throw new AuthorizationError("onsite personnel may submit only safety-screening and safeguarding-training credentials");
  if (Object.keys(definition.attributesSchema).length) throw new Error("This qualification requires a specialized submission form");
  if (data.jurisdictionId) {
    const [jurisdiction] = await executor.select({ id: jurisdictions.id }).from(jurisdictions)
      .where(eq(jurisdictions.id, data.jurisdictionId)).limit(1);
    if (!jurisdiction) throw new Error("Qualification jurisdiction is unavailable");
  }
  if (data.expiresAt && new Date(data.expiresAt) <= new Date()) throw new Error("Submit a current qualification; this one has expired");
}

export const getQualifications = createServerFn({ method: "GET" })
  .validator((value: unknown) => selection.parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(["teacher", "registrar","room_facilitator","site_leader","site_staff"]);
    const { personId, canSubmit } = await authorizedSubject(actor, data);
    const claims = await db.select({
      id: qualificationClaims.id, title: qualificationDefinitions.title,
      issuerName: qualificationClaims.issuerName, jurisdiction: jurisdictions.code,
      issuedAt: qualificationClaims.issuedAt, expiresAt: qualificationClaims.expiresAt,
    }).from(qualificationClaims).innerJoin(qualificationDefinitions, eq(qualificationDefinitions.id, qualificationClaims.definitionId))
      .leftJoin(jurisdictions, eq(jurisdictions.id, qualificationClaims.jurisdictionId))
      .where(eq(qualificationClaims.personId, personId)).orderBy(desc(qualificationClaims.createdAt), desc(qualificationClaims.id)).limit(101);
    const displayed = claims.slice(0, 100);
    const history = displayed.length ? await db.select({
      claimId: qualificationVerificationEvents.claimId, sequence: qualificationVerificationEvents.sequence,
      decision: qualificationVerificationEvents.decision, reason: qualificationVerificationEvents.reason,
      occurredAt: qualificationVerificationEvents.occurredAt, documentId: qualificationVerificationEvents.evidenceDocumentId,
    }).from(qualificationVerificationEvents).where(inArray(qualificationVerificationEvents.claimId, displayed.map(claim => claim.id)))
      .orderBy(desc(qualificationVerificationEvents.sequence)) : [];
    const catalog = canSubmit ? await db.select({ id: qualificationDefinitions.id, title: qualificationDefinitions.title })
      .from(qualificationDefinitions).where(and(
        sql`${qualificationDefinitions.attributesSchema} = '{}'::jsonb`,
        siteCredentialRoles.includes(actor.role) ?
          inArray(qualificationDefinitions.key,["onsite_child_safety_screening","onsite_safeguarding_training"]) : undefined,
      ))
      .orderBy(asc(qualificationDefinitions.title)) : [];
    const jurisdictionOptions = canSubmit ? await db.select({ id: jurisdictions.id, code: jurisdictions.code, name: jurisdictions.name })
      .from(jurisdictions).orderBy(asc(jurisdictions.name)) : [];
    await db.transaction(tx => recordAudit(tx, actor, { action: "qualification.history_read",
      resourceType: "person", resourceId: personId, scope: { programId: data.programId ?? null } }));
    return { personId, canSubmit, canReview: !canSubmit,
      uploadsEnabled: process.env.CAN_R2_QUALIFICATION_UPLOADS_ENABLED === "true",
      catalog, jurisdictions: jurisdictionOptions, hasMore: claims.length > 100,
      claims: displayed.map(claim => {
        const events = history.filter(event => event.claimId === claim.id);
        const latest = events[0];
        return { ...claim, issuedAt: claim.issuedAt?.toISOString() ?? null, expiresAt: claim.expiresAt?.toISOString() ?? null,
          status: credentialStatusFromDecision(latest?.decision), sequence: latest?.sequence ?? 0,
          hasEvidence: Boolean(latest?.documentId),
          history: events.map(({ documentId, ...event }) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) };
      }),
    };
  });

export const beginQualificationUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => upload.parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher","room_facilitator","site_leader","site_staff"], "profiles.credentials.submit");
    await ownCredentialSubject(actor);
    assertUploadsEnabled();
    await catalogEntry(data,db,actor);
    const key = `qualifications/${actor.actorPersonId}/${crypto.randomUUID()}`;
    return { key, uploadHeaders: { "Content-Type": data.mimeType, "If-None-Match": "*" },
      uploadUrl: createPrivateUploadUrl({ key, keyPattern, contentType: data.mimeType,
        contentLength: data.size, minContentLength: 16, maxContentLength: 10 * 1024 * 1024,
        expiresSeconds: 180, preventOverwrite: true }) };
  });

export const finishQualificationUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ key: z.string().regex(keyPattern), claim: upload }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher","room_facilitator","site_leader","site_staff"], "profiles.credentials.submit");
    await ownCredentialSubject(actor);
    assertUploadsEnabled();
    if (!data.key.startsWith(`qualifications/${actor.actorPersonId}/`)) throw new AuthorizationError("own qualification evidence");
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"qualification-upload:" + data.key}))`);
      await ownCredentialSubject(actor, tx);
      const claimId = uuid.parse(data.key.split("/")[2]);
      const [existing] = await tx.select().from(qualificationClaims).where(eq(qualificationClaims.id, claimId)).limit(1);
      if (existing) {
        const [document] = await tx.select().from(documents).where(and(eq(documents.subjectId, actor.actorPersonId),
          eq(documents.subjectType, "person"), eq(documents.category, "qualification"), eq(documents.storageKey, data.key))).limit(1);
        if (existing.personId !== actor.actorPersonId || existing.definitionId !== data.claim.definitionId ||
          existing.issuerName !== data.claim.issuerName || existing.jurisdictionId !== (data.claim.jurisdictionId ?? null) ||
          existing.issuedAt?.toISOString() !== (data.claim.issuedAt ? new Date(data.claim.issuedAt).toISOString() : undefined) ||
          existing.expiresAt?.toISOString() !== (data.claim.expiresAt ? new Date(data.claim.expiresAt).toISOString() : undefined) ||
          !document || document.fileName !== data.claim.fileName || document.mimeType !== data.claim.mimeType ||
          document.metadata.size !== data.claim.size) throw new Error("This upload was already submitted with different qualification details");
        return { claimId, created: false };
      }
      await catalogEntry(data.claim,tx,actor);
      await verifyPrivateObject({ key: data.key, keyPattern, expectedSize: data.claim.size,
        expectedContentType: data.claim.mimeType, verifySignature: matchesEnrollmentDocumentSignature });
      await tx.insert(qualificationClaims).values({ id: claimId, personId: actor.actorPersonId,
        definitionId: data.claim.definitionId, issuerName: data.claim.issuerName, jurisdictionId: data.claim.jurisdictionId,
        issuedAt: data.claim.issuedAt ? new Date(data.claim.issuedAt) : null,
        expiresAt: data.claim.expiresAt ? new Date(data.claim.expiresAt) : null });
      const [document] = await tx.insert(documents).values({
        subjectType: "person", subjectId: actor.actorPersonId, category: "qualification",
        fileName: data.claim.fileName, mimeType: data.claim.mimeType, storageProvider: "cloudflare_r2",
        storageKey: data.key, sensitivityTier: "restricted", uploadedByPersonId: actor.actorPersonId,
        verifiedAt: new Date(), metadata: { size: data.claim.size, claimId },
      }).returning({ id: documents.id });
      if (!document) throw new Error("Failed to save qualification evidence");
      await emitEvent(tx, { eventType: EventTypes.QualificationClaimCreated, aggregateType: "QualificationClaim",
        aggregateId: claimId, actorPersonId: actor.actorPersonId, payload: { definitionId: data.claim.definitionId, documentId: document.id } });
      await recordAudit(tx, actor, { action: "qualification.claim_created", resourceType: "QualificationClaim",
        resourceId: claimId, after: { definitionId: data.claim.definitionId, documentId: document.id } });
      await reviewQualification(actor, { claimId, decision: "submit", evidenceDocumentId: document.id, expectedSequence: 0 }, tx);
      return { claimId, created: true };
    });
  });

async function evidenceForClaim(executor: Reader, claimId: string, personId: string) {
  const [latest] = await executor.select().from(qualificationVerificationEvents)
    .where(eq(qualificationVerificationEvents.claimId, claimId)).orderBy(desc(qualificationVerificationEvents.sequence)).limit(1);
  if (!latest?.evidenceDocumentId) throw new Error("Qualification evidence is unavailable");
  const [document] = await executor.select().from(documents).where(eq(documents.id, latest.evidenceDocumentId)).limit(1);
  if (!document || document.subjectId !== personId || document.subjectType !== "person" ||
    document.category !== "qualification" || document.storageProvider !== "cloudflare_r2" ||
    document.sensitivityTier !== "restricted" || !document.verifiedAt ||
    (document.expiresAt && document.expiresAt <= new Date()) ||
    !document.storageKey.startsWith(`qualifications/${personId}/`) || !keyPattern.test(document.storageKey) ||
    !["application/pdf", "image/jpeg", "image/png"].includes(document.mimeType ?? "")) {
    throw new Error("Verified private qualification evidence is unavailable; submit a new claim with evidence");
  }
  return { document, latest };
}

export const getQualificationEvidence = createServerFn({ method: "POST" })
  .validator((value: unknown) => selection.extend({ claimId: uuid }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(["teacher", "registrar","room_facilitator","site_leader","site_staff"]);
    return db.transaction(async tx => {
      const { personId } = await authorizedSubject(actor, data, tx);
      const [claim] = await tx.select({ personId: qualificationClaims.personId }).from(qualificationClaims)
        .where(eq(qualificationClaims.id, data.claimId)).limit(1);
      if (!claim || claim.personId !== personId) throw new AuthorizationError("qualification claim owner");
      const { document } = await evidenceForClaim(tx, data.claimId, personId);
      const url = signPrivateObjectUrl({ method: "GET", key: document.storageKey, keyPattern, expiresSeconds: 60 });
      await recordAudit(tx, actor, { action: "qualification.evidence_read", resourceType: "document", resourceId: document.id,
        scope: { programId: data.programId ?? null }, after: { claimId: data.claimId, personId } });
      return { url };
    });
  });

export const decideQualification = createServerFn({ method: "POST" })
  .validator((value: unknown) => selection.extend({ claimId: uuid, expectedSequence: z.number().int().min(1),
    decision: z.enum(["approve", "reject", "revoke"]), reason: z.string().trim().min(5).max(2000) }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], "profiles.credentials.verify");
    return db.transaction(async tx => {
      const { personId } = await authorizedSubject(actor, data, tx);
      const [claim] = await tx.select({ personId: qualificationClaims.personId }).from(qualificationClaims)
        .where(eq(qualificationClaims.id, data.claimId)).for("update").limit(1);
      if (!claim || claim.personId !== personId) throw new AuthorizationError("qualification claim owner");
      if (data.decision === "approve") await evidenceForClaim(tx, data.claimId, personId);
      return reviewQualification(actor, data, tx);
    });
  });
