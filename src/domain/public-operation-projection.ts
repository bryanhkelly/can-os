import { z } from "zod";
import { isPublicSiteSlug } from "./public-site-address";

const publicProgramClaimRowSchema = z.object({
  claimId: z.string().uuid(),
  operationId: z.string().uuid(),
  programClaimKind: z.enum(["proposed", "approved", "enrolling", "operating"]),
  displayText: z.string().min(1),
  publishedAt: z.coerce.date(),
}).strict();

export const publicOperationProjectionInputSchema = z.object({
  operationId: z.string().uuid(),
}).strict();

export const currentPublicProgramClaimsSchema = z.array(publicProgramClaimRowSchema);

const publicSiteClaimRowSchema = z.object({
  siteId: z.string().uuid(),
  siteName: z.string().min(1),
  operationId: z.string().uuid().nullable(),
  programClaimKind: z.enum(["proposed", "approved", "enrolling", "operating"]).nullable(),
  displayText: z.string().min(1).nullable(),
  publishedAt: z.coerce.date().nullable(),
}).strict().refine((row) => {
  const claimFields = [row.operationId, row.programClaimKind, row.displayText, row.publishedAt];
  return claimFields.every((field) => field === null) ||
    claimFields.every((field) => field !== null);
});

export const publicSiteProjectionInputSchema = z.object({
  slug: z.string().refine(isPublicSiteSlug),
}).strict();

export const publicSiteClaimRowsSchema = z.array(publicSiteClaimRowSchema);

export type CurrentPublicProgramClaim = z.infer<typeof publicProgramClaimRowSchema>;
type PublicSiteClaimRow = z.infer<typeof publicSiteClaimRowSchema>;
export type PublicOperationProjection = {
  operationId: string;
  claims: Array<{
    kind: CurrentPublicProgramClaim["programClaimKind"];
    displayText: string;
    publishedAt: Date;
  }>;
};
export type PublicSiteProjection = {
  siteName: string;
  claims: Array<{
    operationId: string;
    kind: NonNullable<PublicSiteClaimRow["programClaimKind"]>;
    displayText: string;
    publishedAt: Date;
  }>;
};

export function projectPublicOperation(
  operationId: string,
  rows: readonly CurrentPublicProgramClaim[],
): PublicOperationProjection {
  return {
    operationId,
    claims: rows
      .filter((claim) => claim.operationId === operationId)
      .map(({ programClaimKind, displayText, publishedAt }) => ({
        kind: programClaimKind,
        displayText,
        publishedAt,
      }))
      .sort((left, right) =>
        left.kind.localeCompare(right.kind)
        || left.displayText.localeCompare(right.displayText)
        || left.publishedAt.getTime() - right.publishedAt.getTime(),
      ),
  };
}

export function projectPublicSiteClaims(
  rows: readonly PublicSiteClaimRow[],
): PublicSiteProjection | null {
  if (rows.length === 0) return null;
  const site = rows[0]!;
  if (rows.some((row) => row.siteId !== site.siteId || row.siteName !== site.siteName)) {
    throw new Error("Public Site projection returned inconsistent Site identity.");
  }

  const claims = rows.flatMap((row) => {
    if (row.operationId === null || row.programClaimKind === null ||
        row.displayText === null || row.publishedAt === null) return [];
    return [{
      operationId: row.operationId,
      kind: row.programClaimKind,
      displayText: row.displayText,
      publishedAt: row.publishedAt,
    }];
  });
  claims.sort((left, right) =>
    left.operationId.localeCompare(right.operationId)
    || left.kind.localeCompare(right.kind)
    || left.displayText.localeCompare(right.displayText)
    || left.publishedAt.getTime() - right.publishedAt.getTime(),
  );
  return { siteName: site.siteName, claims };
}
