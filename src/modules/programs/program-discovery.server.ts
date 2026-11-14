import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  catalogSites,
  geographicAreas,
  offeringVersions,
  offerings,
  qualificationProgramFitPolicies,
  qualificationProgramFitPolicyVersions,
} from "@/db/canonical-v301";
import {
  projectAvailableOfferings,
  programDiscoveryInputSchema,
  type ProgramAvailability,
  type PublishedOffering,
} from "@/domain/program-discovery";
import {
  assertCapability,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { programCatalogDatabaseRole } from "@/domain/program-catalog-database-role";
import { DomainError } from "@/domain/errors";

const catalogAvailabilityRowSchema = z.object({
  policyVersionId: z.string().uuid(),
  providerSupport: z.enum(["possible", "conditional", "unavailable", "requires_research"]),
  regulatoryStatus: z.enum(["possible", "conditional", "unavailable", "requires_research"]),
  catalogStatus: z.enum(["supported", "conditional", "unavailable", "review_required"]),
  explanation: z.string(),
}).strict();

export async function getAvailableOfferings(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "program.launch.start");
  const input = programDiscoveryInputSchema.parse(rawInput);
  // Fail closed before attempting purpose-specific PostgreSQL roles. The
  // canonical catalog must be explicitly provisioned before it can be exposed
  // through either native Blueprint planning or the legacy School Hub.
  if (process.env.CAN_CANONICAL_CATALOG_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE",
      "Published program discovery is not yet enabled for this environment.");
  }
  const databaseRole = programCatalogDatabaseRole(context);

  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    let geographicAreaId: string | null;
    if (input.subject.kind === "site") {
      if (!context.scope.siteIds?.includes(input.subject.siteId)) {
        throw new AuthorizationError("site scope");
      }
      const [site] = await tx.select({
        geographicAreaId: catalogSites.geographicAreaId,
        status: catalogSites.status,
      }).from(catalogSites)
        .where(eq(catalogSites.id, input.subject.siteId))
        .limit(1);
      if (!site || site.status === "closed") {
        throw new DomainError("UNAVAILABLE", "The selected Site is unavailable for program discovery.");
      }
      geographicAreaId = site.geographicAreaId;
    } else {
      if (!context.scope.organizationIds?.length) {
        throw new AuthorizationError("proposing organization scope");
      }
      const [geography] = await tx.select({ id: geographicAreas.id })
        .from(geographicAreas)
        .where(eq(geographicAreas.id, input.subject.geographicAreaId))
        .limit(1);
      if (!geography) {
        throw new DomainError("VALIDATION_FAILED", "The proposed location is not in a recognized geographic area.");
      }
      geographicAreaId = geography.id;
    }

    const availabilityResult = await tx.execute(sql`
      SELECT policy_version_id AS "policyVersionId",
        provider_support AS "providerSupport",
        regulatory_status AS "regulatoryStatus",
        catalog_status AS "catalogStatus",
        explanation
      FROM education_v30.v30_catalog_program_availability(
        ${geographicAreaId}::uuid,
        ${input.deliveryContext}::text
      )
    `);
    const availabilityRows = z.array(catalogAvailabilityRowSchema).parse(availabilityResult.rows);
    if (availabilityRows.length === 0) return [];

    const policyVersionIds = availabilityRows.map((row) => row.policyVersionId);
    const products = await tx.select({
      policyVersionId: qualificationProgramFitPolicyVersions.id,
      offeringId: offerings.id,
      offeringVersionId: offeringVersions.id,
      code: offerings.code,
      title: offerings.title,
      versionNo: offeringVersions.versionNo,
    }).from(qualificationProgramFitPolicyVersions)
      .innerJoin(
        qualificationProgramFitPolicies,
        eq(qualificationProgramFitPolicies.id, qualificationProgramFitPolicyVersions.policyId),
      )
      .innerJoin(
        offeringVersions,
        eq(offeringVersions.id, qualificationProgramFitPolicyVersions.offeringVersionId),
      )
      .innerJoin(offerings, eq(offerings.id, offeringVersions.offeringId))
      .where(and(
        inArray(qualificationProgramFitPolicyVersions.id, policyVersionIds),
        eq(qualificationProgramFitPolicies.status, "active"),
        eq(offerings.status, "active"),
        eq(offeringVersions.lifecycle, "published"),
      ));

    const offeringVersionByPolicy = new Map(
      products.map((product) => [product.policyVersionId, product.offeringVersionId]),
    );
    const availablePolicies: ProgramAvailability[] = availabilityRows.flatMap((row) => {
      const offeringVersionId = offeringVersionByPolicy.get(row.policyVersionId);
      return offeringVersionId ? [{ ...row, offeringVersionId }] : [];
    });
    const productRows: PublishedOffering[] = products.map((product) => ({
      offeringId: product.offeringId,
      offeringVersionId: product.offeringVersionId,
      code: product.code,
      title: product.title,
      versionNo: product.versionNo,
    }));

    return projectAvailableOfferings(productRows, availablePolicies);
  });
}
