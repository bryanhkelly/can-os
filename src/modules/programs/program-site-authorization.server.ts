import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents, organizations, programs, programSiteAuthorizations, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import {
  assertChurchCANOperatingIdentity, assertCurrentOperatingAuthorization,
  assertOperatingAgreementEvidence, normalizeOperatingServices, recommendedChurchOperatingServices,
  type OperatingProgramIdentity, type OperatingService,
} from "@/domain/program-site-operating-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Reader = Pick<typeof db, "select">;

/** Resolve all contracting parties from actual canonical Program, Site and Org rows. */
async function loadOperatingIdentity(
  tx: Reader, programId: string,
): Promise<OperatingProgramIdentity> {
  const [program] = await tx.select({
    id: programs.id, organizationId: programs.organizationId,
    siteId: programs.siteId, hostOrganizationId: programs.hostOrganizationId,
    institutionOrganizationId: programs.academicProviderOrganizationId,
    creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program) throw new AuthorizationError("existing program");
  const hostId = program.hostOrganizationId ?? program.organizationId;
  const [site] = program.siteId
    ? await tx.select({ organizationId: sites.organizationId })
        .from(sites).where(eq(sites.id, program.siteId)).limit(1) : [];
  const [host] = await tx.select({ type: organizations.type })
    .from(organizations).where(eq(organizations.id, hostId)).limit(1);
  const [institution] = await tx.select({ type: organizations.type })
    .from(organizations).where(eq(organizations.id, program.institutionOrganizationId)).limit(1);
  const identity: OperatingProgramIdentity = {
    programId: program.id, programOrganizationId: program.organizationId,
    siteId: program.siteId, siteOrganizationId: site?.organizationId ?? null,
    hostOrganizationId: hostId, hostOrganizationType: host?.type ?? "",
    institutionOrganizationId: program.institutionOrganizationId,
    institutionOrganizationType: institution?.type ?? "",
    creditIssuingOrganizationId: program.creditIssuingOrganizationId,
  };
  assertChurchCANOperatingIdentity(identity);
  return identity;
}
function assertHostRequester(actor: AccessContext, identity: OperatingProgramIdentity) {
  if (actor.demoFacilitator || actor.role !== "registrar" || !actor.actorPersonId ||
      !actor.scope.organizationIds?.includes(identity.hostOrganizationId) ||
      !identity.siteId || !actor.scope.siteIds?.includes(identity.siteId) ||
      !actor.scope.programIds?.includes(identity.programId))
    throw new AuthorizationError("verified church-host registrar for this Program and Site");
  assertCapability(actor, "program.launch.start");
}
function assertIndependentCANReviewer(actor: AccessContext, identity: OperatingProgramIdentity) {
  if (actor.demoFacilitator || !actor.scope.organizationIds?.includes(identity.institutionOrganizationId))
    throw new AuthorizationError("separate CAN institutional reviewer");
  assertCANSteward(actor, {
    id: identity.institutionOrganizationId, type: identity.institutionOrganizationType,
  }, "network.agreements.verify");
}

/** Church registrar requests a precisely scoped service relationship.
 * No staff grants, school-year activation or publication is created.
 */
export async function requestProgramSiteAuthorization(
  actor: AccessContext, input: { programId: string; services: string[] },
) {
  return db.transaction(async tx => {
    // Serialize duplicate/retry and version allocation on the canonical Program.
    await tx.select({ id: programs.id }).from(programs)
      .where(eq(programs.id, input.programId)).for("update").limit(1);
    const identity = await loadOperatingIdentity(tx, input.programId);
    assertHostRequester(actor, identity);
    const services = normalizeOperatingServices(input.services);
    if (services.includes("credit_issuance") && identity.creditIssuingOrganizationId === null)
      throw new AuthorizationError("credit issuance cannot be contracted for a noncredit Program");
    const [last] = await tx.select().from(programSiteAuthorizations)
      .where(eq(programSiteAuthorizations.programId, identity.programId))
      .orderBy(desc(programSiteAuthorizations.version)).limit(1);
    if (last?.status === "requested") {
      if (JSON.stringify(normalizeOperatingServices(last.services)) !== JSON.stringify(services))
        throw new Error("A different operating authorization request is already pending");
      return { authorizationId: last.id, status: "requested" as const, created: false };
    }
    if (last?.status === "approved") throw new Error("Revoke the current authorization before requesting a replacement");
    const [created] = await tx.insert(programSiteAuthorizations).values({
      programId: identity.programId, siteId: identity.siteId!,
      hostOrganizationId: identity.hostOrganizationId,
      institutionOrganizationId: identity.institutionOrganizationId,
      services, version: (last?.version ?? 0) + 1,
      requestedByPersonId: actor.actorPersonId!,
    }).returning({ id: programSiteAuthorizations.id });
    if (!created) throw new Error("Unable to create operating authorization request");
    await writeAudit(tx, actor, {
      action: "program.site.authorization.request",
      entityType: "program_site_authorization", entityId: created.id,
      scope: { organizationId: identity.hostOrganizationId, siteId: identity.siteId,
        programId: identity.programId },
      after: { status: "requested", services, institutionOrganizationId: identity.institutionOrganizationId },
    });
    await emitEvent(tx, {
      eventType: "ProgramSiteAuthorizationRequested", aggregateType: "program_site_authorization",
      aggregateId: created.id, actorPersonId: actor.actorPersonId,
      organizationId: identity.hostOrganizationId, siteId: identity.siteId, programId: identity.programId,
      payload: { institutionOrganizationId: identity.institutionOrganizationId, services },
    });
    return { authorizationId: created.id, status: "requested" as const, created: true };
  });
}

/** Independent CAN institutional approval of a previously submitted host request.
 * The contract is verified by a THIRD person, and must name both parties,
 * the exact Site and Program and every authorized service.
 */
export async function reviewProgramSiteAuthorization(
  actor: AccessContext,
  input: {
    authorizationId: string; decision: "approved" | "denied";
    reason: string; evidenceDocumentId?: string;
    effectiveFrom?: Date; effectiveThrough?: Date;
  },
) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500)
    throw new Error("Provide a 10–500 character independent review reason");
  return db.transaction(async tx => {
    const [request] = await tx.select().from(programSiteAuthorizations)
      .where(eq(programSiteAuthorizations.id, input.authorizationId)).for("update").limit(1);
    if (!request) throw new AuthorizationError("existing authorization request");
    const identity = await loadOperatingIdentity(tx, request.programId);
    assertIndependentCANReviewer(actor, identity);
    if (identity.siteId !== request.siteId ||
        identity.hostOrganizationId !== request.hostOrganizationId ||
        identity.institutionOrganizationId !== request.institutionOrganizationId)
      throw new AuthorizationError("unchanged Program-Site institutional parties");
    if (actor.actorPersonId === request.requestedByPersonId)
      throw new AuthorizationError("independent reviewer");
    if (request.status !== "requested")
      throw new Error("Authorization request already reviewed; use the revocation or new-version workflow");

    let evidenceDocumentId: string | null = null;
    let effectiveFrom: Date | null = null;
    let effectiveThrough: Date | null = null;
    if (input.decision === "approved") {
      if (!input.evidenceDocumentId || !input.effectiveFrom || !input.effectiveThrough ||
          !Number.isFinite(input.effectiveFrom.getTime()) ||
          !Number.isFinite(input.effectiveThrough.getTime()) ||
          input.effectiveFrom >= input.effectiveThrough ||
          input.effectiveThrough <= new Date())
        throw new Error("Approval requires a valid future-effective agreement interval");
      const [doc] = await tx.select({
        subjectType: documents.subjectType, subjectId: documents.subjectId,
        category: documents.category, verifiedAt: documents.verifiedAt,
        verifiedByPersonId: documents.verifiedByPersonId,
        expiresAt: documents.expiresAt, metadata: documents.metadata,
      }).from(documents).where(eq(documents.id, input.evidenceDocumentId)).limit(1);
      assertOperatingAgreementEvidence(doc, identity, request.services,
        request.requestedByPersonId, actor.actorPersonId!, input.effectiveThrough);
      evidenceDocumentId = input.evidenceDocumentId;
      effectiveFrom = input.effectiveFrom;
      effectiveThrough = input.effectiveThrough;
    }
    const now = new Date();
    await tx.update(programSiteAuthorizations).set({
      status: input.decision, reviewedByPersonId: actor.actorPersonId,
      reviewedAt: now, reviewReason: reason,
      evidenceDocumentId, effectiveFrom, effectiveThrough, updatedAt: now,
    }).where(eq(programSiteAuthorizations.id, request.id));
    await writeAudit(tx, actor, {
      action: "program.site.authorization.review",
      entityType: "program_site_authorization", entityId: request.id,
      scope: { organizationId: identity.institutionOrganizationId,
        siteId: identity.siteId, programId: identity.programId },
      before: { status: "requested" },
      after: { status: input.decision, reason, evidenceDocumentId,
        effectiveFrom: effectiveFrom?.toISOString() ?? null,
        effectiveThrough: effectiveThrough?.toISOString() ?? null },
    });
    await emitEvent(tx, {
      eventType: input.decision === "approved"
        ? "ProgramSiteAuthorizationApproved" : "ProgramSiteAuthorizationDenied",
      aggregateType: "program_site_authorization", aggregateId: request.id,
      actorPersonId: actor.actorPersonId,
      organizationId: identity.institutionOrganizationId,
      siteId: identity.siteId, programId: identity.programId,
      payload: { services: request.services },
    });
    return { authorizationId: request.id, status: input.decision };
  });
}

/** Revoke current contractual operating authority. Revocation doesn't erase past
 * academic evidence, but blocks new delegated operations on the next command.
 */
export async function revokeProgramSiteAuthorization(
  actor: AccessContext, input: { authorizationId: string; reason: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500)
    throw new Error("Provide a 10–500 character revocation reason");
  return db.transaction(async tx => {
    const [record] = await tx.select().from(programSiteAuthorizations)
      .where(eq(programSiteAuthorizations.id, input.authorizationId)).for("update").limit(1);
    if (!record) throw new AuthorizationError("existing current authorization");
    const identity = await loadOperatingIdentity(tx, record.programId);
    // Both contracting parties have the ability to withdraw the operating
    // relationship, but neither can approve on behalf of the other party.
    if (actor.role === "registrar") {
      assertHostRequester(actor, identity);
    } else {
      assertIndependentCANReviewer(actor, identity);
    }
    if (identity.siteId !== record.siteId ||
        identity.hostOrganizationId !== record.hostOrganizationId ||
        identity.institutionOrganizationId !== record.institutionOrganizationId)
      throw new AuthorizationError("unchanged contracting parties");
    if (record.status !== "approved")
      throw new Error("Only a currently approved authorization can be revoked");
    const now = new Date();
    await tx.update(programSiteAuthorizations).set({
      status: "revoked", revokedByPersonId: actor.actorPersonId,
      revokedAt: now, revocationReason: reason, updatedAt: now,
    }).where(eq(programSiteAuthorizations.id, record.id));
    await writeAudit(tx, actor, {
      action: "program.site.authorization.revoke",
      entityType: "program_site_authorization", entityId: record.id,
      scope: { organizationId: identity.hostOrganizationId,
        siteId: identity.siteId, programId: identity.programId },
      before: { status: "approved" }, after: { status: "revoked", reason },
    });
    await emitEvent(tx, {
      eventType: "ProgramSiteAuthorizationRevoked",
      aggregateType: "program_site_authorization", aggregateId: record.id,
      actorPersonId: actor.actorPersonId,
      organizationId: identity.hostOrganizationId,
      siteId: identity.siteId, programId: identity.programId,
      payload: { institutionOrganizationId: identity.institutionOrganizationId },
    });
    return { authorizationId: record.id, status: "revoked" as const };
  });
}

/** Read on every cross-institutional operation, not just on login or launch.
 * Program/Site/host/issuer authority is derived from DB rows, never a client claim.
 */
export async function requireCurrentProgramSiteAuthorization(
  tx: Reader, programId: string, requiredServices: readonly OperatingService[], at = new Date(),
): Promise<string> {
  const identity = await loadOperatingIdentity(tx, programId);
  const rows = await tx.select({
    authorization: programSiteAuthorizations,
    evidence: {
      subjectType: documents.subjectType, subjectId: documents.subjectId,
      category: documents.category, verifiedAt: documents.verifiedAt,
      verifiedByPersonId: documents.verifiedByPersonId,
      expiresAt: documents.expiresAt, metadata: documents.metadata,
    },
  }).from(programSiteAuthorizations)
    .innerJoin(documents, eq(programSiteAuthorizations.evidenceDocumentId, documents.id))
    .where(and(
      eq(programSiteAuthorizations.programId, identity.programId),
      eq(programSiteAuthorizations.siteId, identity.siteId!),
      eq(programSiteAuthorizations.hostOrganizationId, identity.hostOrganizationId),
      eq(programSiteAuthorizations.institutionOrganizationId, identity.institutionOrganizationId),
      eq(programSiteAuthorizations.status, "approved"),
      isNull(programSiteAuthorizations.revokedAt),
      lte(programSiteAuthorizations.effectiveFrom, at),
      gt(programSiteAuthorizations.effectiveThrough, at),
    )).for("share", { of: programSiteAuthorizations }).limit(2);
  for (const { authorization, evidence } of rows) {
    try {
      assertCurrentOperatingAuthorization(authorization, identity, requiredServices, at);
      assertOperatingAgreementEvidence(evidence, identity, authorization.services,
        authorization.requestedByPersonId, authorization.reviewedByPersonId!, authorization.effectiveThrough!, at);
      return authorization.id;
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }
  throw new AuthorizationError("current independently verified CAN-church operating authority");
}

/** The host's onsite staff retains original Site/Program grants, but an
 * approved service contract can never be silently assumed on local writes.
 * This helper is NOT a replacement for local role, Site or duty checks.
 */
export async function requireChurchHostedOperatingServices(
  tx: Reader, programId: string, requiredServices: readonly OperatingService[],
): Promise<string | null> {
  const [program] = await tx.select({
    organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    institutionOrganizationId: programs.academicProviderOrganizationId,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program) throw new AuthorizationError("existing school Program");
  const hostId = program.hostOrganizationId ?? program.organizationId;
  const [host] = await tx.select({type: organizations.type})
    .from(organizations).where(eq(organizations.id, hostId)).limit(1);
  if (!host) throw new AuthorizationError("existing school host");
  if (host.type === "church" && program.institutionOrganizationId !== hostId)
    return requireCurrentProgramSiteAuthorization(tx,programId,requiredServices);
  return null;
}

/** Institutional academic writes are not authorized merely because a church
 * Program names CAN as its provider. This check is intentionally separate from
 * the actor's verified role / Program / Section relationship checks.
 *
 * Same-organization and non-church Programs keep their existing workflows.
 * Any independently church-owned CAN Program requires BOTH an original
 * CAN-organization membership and a live, service-specific agreement.
 * Call inside the mutation transaction, after verifying resource scope.
 */
export async function requireInstitutionalAcademicProgramAuthority(
  tx: Reader,
  actor: Pick<AccessContext, "scope">,
  programId: string,
  requiredServices: readonly OperatingService[],
): Promise<string | null> {
  const [program] = await tx.select({
    organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    institutionOrganizationId: programs.academicProviderOrganizationId,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program) throw new AuthorizationError("existing academic Program");
  const hostId = program.hostOrganizationId ?? program.organizationId;
  const [host] = await tx.select({type: organizations.type})
    .from(organizations).where(eq(organizations.id, hostId)).limit(1);
  if (!host) throw new AuthorizationError("existing Program host");
  if (host.type !== "church" || program.institutionOrganizationId === hostId)
    return null;
  if (!actor.scope.organizationIds?.includes(program.institutionOrganizationId))
    throw new AuthorizationError("verified CAN institutional Organization membership");
  return requireCurrentProgramSiteAuthorization(tx, programId, requiredServices);
}

/** Authenticated, minimal host workspace projection. Never returns other
 * churches' agreement evidence or CAN administrative lists.
 */
export async function getHostProgramSiteAuthorization(
  actor: AccessContext, programId: string,
) {
  const [program] = await db.select({
    organizationId: programs.organizationId, siteId: programs.siteId,
    hostOrganizationId: programs.hostOrganizationId,
    institutionOrganizationId: programs.academicProviderOrganizationId,
    creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program || actor.role !== "registrar" || actor.demoFacilitator ||
      !actor.scope.organizationIds?.includes(program.organizationId) ||
      !actor.scope.programIds?.includes(programId) ||
      !program.siteId || !actor.scope.siteIds?.includes(program.siteId))
    throw new AuthorizationError("host registrar Program and Site scope");
  const [host] = await db.select({ type: organizations.type })
    .from(organizations).where(eq(organizations.id,
      program.hostOrganizationId ?? program.organizationId)).limit(1);
  if (host?.type !== "church" ||
      program.institutionOrganizationId === (program.hostOrganizationId ?? program.organizationId))
    return {
      eligible: false, programId, siteId: program.siteId,
      institutionOrganizationId: program.institutionOrganizationId,
      recommendedServices: recommendedChurchOperatingServices(program.creditIssuingOrganizationId !== null),
      canIssueCredit: program.creditIssuingOrganizationId !== null,
      authorization: null,
    };
  const identity = await loadOperatingIdentity(db, programId);
  assertHostRequester(actor, identity);
  const [record] = await db.select({
    id: programSiteAuthorizations.id, version: programSiteAuthorizations.version,
    status: programSiteAuthorizations.status,
    services: programSiteAuthorizations.services,
    effectiveFrom: programSiteAuthorizations.effectiveFrom,
    effectiveThrough: programSiteAuthorizations.effectiveThrough,
    revokedAt: programSiteAuthorizations.revokedAt,
    reviewReason: programSiteAuthorizations.reviewReason,
  }).from(programSiteAuthorizations)
    .where(eq(programSiteAuthorizations.programId, programId))
    .orderBy(desc(programSiteAuthorizations.version)).limit(1);
  return {
    eligible: true, programId, siteId: identity.siteId,
    institutionOrganizationId: identity.institutionOrganizationId,
    recommendedServices: recommendedChurchOperatingServices(identity.creditIssuingOrganizationId !== null),
    canIssueCredit: identity.creditIssuingOrganizationId !== null,
    authorization: record ?? null,
  };
}

/** Steward-only approval queue, limited to the CAN Organization of the
 * authenticated steward. Never expose the signed agreement's private bytes.
 */
export async function listCANOperatingAuthorizationDesk(actor: AccessContext) {
  if (actor.demoFacilitator || actor.grantSiteId !== null || !actor.actorPersonId ||
      actor.role !== "can_network_steward" ||
      !actor.capabilities.has("network.agreements.verify") ||
      (actor.scope.organizationIds?.length ?? 0) !== 1)
    throw new AuthorizationError("CAN operating authorization reviewer");
  const orgId = actor.scope.organizationIds![0]!;
  const [institution] = await db.select({ type: organizations.type })
    .from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (institution?.type !== "can_network")
    throw new AuthorizationError("CAN institutional reviewer");
  const requests = await db.select({
    id: programSiteAuthorizations.id, programId: programSiteAuthorizations.programId,
    siteId: programSiteAuthorizations.siteId,
    hostOrganizationId: programSiteAuthorizations.hostOrganizationId,
    institutionOrganizationId: programSiteAuthorizations.institutionOrganizationId,
    programName: programs.name, hostName: organizations.name,
    status: programSiteAuthorizations.status, services: programSiteAuthorizations.services,
    version: programSiteAuthorizations.version, requestedAt: programSiteAuthorizations.requestedAt,
    reviewedAt: programSiteAuthorizations.reviewedAt,
    effectiveFrom: programSiteAuthorizations.effectiveFrom,
    effectiveThrough: programSiteAuthorizations.effectiveThrough,
  }).from(programSiteAuthorizations)
    .innerJoin(programs, eq(programSiteAuthorizations.programId, programs.id))
    .innerJoin(organizations, eq(programSiteAuthorizations.hostOrganizationId, organizations.id))
    .where(eq(programSiteAuthorizations.institutionOrganizationId, orgId))
    .orderBy(desc(programSiteAuthorizations.requestedAt)).limit(100);
  return { authorizations: requests };
}


/** Minimal metadata for the independent reviewer of one pending request.
 * Selection is advisory; the approval command revalidates evidence and parties.
 * This read grants no document download or storage access.
 */
export async function listOperatingAgreementEvidence(
  actor: AccessContext, input: { authorizationId: string; effectiveThrough: Date },
) {
  const at = new Date();
  if (!Number.isFinite(input.effectiveThrough.getTime()) || input.effectiveThrough <= at)
    throw new Error("Choose a future exclusive end date for the agreement");
  const [request] = await db.select().from(programSiteAuthorizations)
    .where(eq(programSiteAuthorizations.id, input.authorizationId)).limit(1);
  if (!request) throw new AuthorizationError("existing authorization request");
  const identity = await loadOperatingIdentity(db, request.programId);
  assertIndependentCANReviewer(actor, identity);
  if (identity.siteId !== request.siteId ||
      identity.hostOrganizationId !== request.hostOrganizationId ||
      identity.institutionOrganizationId !== request.institutionOrganizationId ||
      actor.actorPersonId === request.requestedByPersonId)
    throw new AuthorizationError("independent reviewer of unchanged Program-Site parties");
  if (request.status !== "requested")
    throw new Error("Evidence selection requires a pending authorization request");
  const rows = await db.select({
    id: documents.id, fileName: documents.fileName,
    subjectType: documents.subjectType, subjectId: documents.subjectId,
    category: documents.category, verifiedAt: documents.verifiedAt,
    verifiedByPersonId: documents.verifiedByPersonId,
    expiresAt: documents.expiresAt, metadata: documents.metadata,
  }).from(documents).where(and(
    eq(documents.subjectType, "program"),
    eq(documents.subjectId, identity.programId),
    eq(documents.category, "program_site_operating_agreement"),
  )).orderBy(desc(documents.createdAt), desc(documents.id)).limit(101);
  const candidates = rows.slice(0, 100).flatMap(doc => {
    try {
      assertOperatingAgreementEvidence(doc, identity, request.services,
        request.requestedByPersonId, actor.actorPersonId!, input.effectiveThrough, at);
      return [{
        id: doc.id, fileName: doc.fileName,
        verifiedAt: doc.verifiedAt!.toISOString(),
        expiresAt: doc.expiresAt?.toISOString() ?? null,
      }];
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
      return [];
    }
  });
  return { candidates, truncated: rows.length > 100 };
}
