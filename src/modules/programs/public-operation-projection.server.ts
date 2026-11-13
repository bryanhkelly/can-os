import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  currentPublicProgramClaimsSchema,
  projectPublicOperation,
  projectPublicSiteClaims,
  publicOperationProjectionInputSchema,
  publicSiteClaimRowsSchema,
  publicSiteProjectionInputSchema,
} from "@/domain/public-operation-projection";

export async function getPublicOperationProjection(rawInput: unknown) {
  const { operationId } = publicOperationProjectionInputSchema.parse(rawInput);
  const result = await db.execute(sql`
    SELECT claim_id AS "claimId",
      operation_id AS "operationId",
      program_claim_kind AS "programClaimKind",
      display_text AS "displayText",
      published_at AS "publishedAt"
    FROM education_v30.v301_current_public_program_claims
    WHERE operation_id = ${operationId}::uuid
  `);
  const claims = currentPublicProgramClaimsSchema.parse(result.rows);
  return projectPublicOperation(operationId, claims);
}

export async function getPublicSiteProjection(rawInput: unknown) {
  const { slug } = publicSiteProjectionInputSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET LOCAL ROLE can_v30_public_site_reader"));
    const result = await tx.execute(sql`
      SELECT site_id AS "siteId",
        site_name AS "siteName",
        operation_id AS "operationId",
        program_claim_kind AS "programClaimKind",
        display_text AS "displayText",
        published_at AS "publishedAt"
      FROM education_v30.v301_public_site_claims(${slug}::text)
    `);
    const rows = publicSiteClaimRowsSchema.parse(result.rows);
    return projectPublicSiteClaims(rows);
  });
}
