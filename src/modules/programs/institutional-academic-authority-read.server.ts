import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, organizations, programs, programSiteAuthorizations, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import {
  assertCurrentOperatingAuthorization, assertOperatingAgreementEvidence,
  normalizeOperatingServices, type OperatingProgramIdentity, type OperatingService,
} from "@/domain/program-site-operating-policy";

type Reader = Pick<typeof db, "select">;

/**
 * Batch the exact same institutional agreement and evidence checks used by
 * requireInstitutionalAcademicProgramAuthority. This is a READ-side scope
 * projection for assigned Sections, not permission to mutate a Program.
 * Every caller still needs its Section assignment and the original membership.
 */
export async function listInstitutionallyAuthorizedAcademicProgramIds(
  tx: Reader,
  actor: Pick<AccessContext, "scope">,
  programIds: readonly string[],
  requiredServices: readonly OperatingService[],
  at = new Date(),
): Promise<Set<string>> {
  const unique = [...new Set(programIds)];
  const permitted = new Set<string>();
  if (!unique.length) return permitted;
  normalizeOperatingServices(requiredServices);

  const host = organizations;
  const rows = await tx.select({
    id: programs.id,
    organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    siteId: programs.siteId,
    siteOrganizationId: sites.organizationId,
    hostType: host.type,
    institutionOrganizationId: programs.academicProviderOrganizationId,
    creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
  }).from(programs)
    .leftJoin(sites, eq(sites.id, programs.siteId))
    .innerJoin(host, eq(host.id, sql`coalesce(${programs.hostOrganizationId}, ${programs.organizationId})`))
    .where(inArray(programs.id, unique));

  const institutionIds = [...new Set(rows.map(row => row.institutionOrganizationId))];
  const institutionRows = institutionIds.length
    ? await tx.select({ id: organizations.id, type: organizations.type })
      .from(organizations).where(inArray(organizations.id, institutionIds))
    : [];
  const institutionTypes = new Map(institutionRows.map(row => [row.id, row.type]));
  const churchPrograms = new Map<string, OperatingProgramIdentity>();
  for (const row of rows) {
    const hostId = row.hostOrganizationId ?? row.organizationId;
    // An unrelated caller cannot turn a permissive same-host/non-church\n    // Program into an arbitrary authorization result.\n    if (!actor.scope.organizationIds?.includes(row.institutionOrganizationId)) continue;\n    if (row.hostType !== "church" || row.institutionOrganizationId === hostId) {
      permitted.add(row.id);
      continue;
    }
    if (!actor.scope.organizationIds?.includes(row.institutionOrganizationId)) continue;
    churchPrograms.set(row.id, {
      programId: row.id, programOrganizationId: row.organizationId,
      siteId: row.siteId, siteOrganizationId: row.siteOrganizationId,
      hostOrganizationId: hostId, hostOrganizationType: row.hostType,
      institutionOrganizationId: row.institutionOrganizationId,
      institutionOrganizationType: institutionTypes.get(row.institutionOrganizationId) ?? "",
      creditIssuingOrganizationId: row.creditIssuingOrganizationId,
    });
  }
  if (!churchPrograms.size) return permitted;
  const candidates = await tx.select({
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
      inArray(programSiteAuthorizations.programId, [...churchPrograms.keys()]),
      eq(programSiteAuthorizations.status, "approved"),
      isNull(programSiteAuthorizations.revokedAt),
      lte(programSiteAuthorizations.effectiveFrom, at),
      gt(programSiteAuthorizations.effectiveThrough, at),
    ));
  for (const { authorization, evidence } of candidates) {
    const identity = churchPrograms.get(authorization.programId);
    if (!identity || permitted.has(identity.programId)) continue;
    try {
      assertCurrentOperatingAuthorization(authorization, identity, requiredServices, at);
      assertOperatingAgreementEvidence(evidence, identity, authorization.services,
        authorization.requestedByPersonId, authorization.reviewedByPersonId!,
        authorization.effectiveThrough!, at);
      permitted.add(identity.programId);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }
  return permitted;
}
