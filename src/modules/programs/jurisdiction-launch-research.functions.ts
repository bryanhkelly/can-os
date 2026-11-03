import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { jurisdictionProfileVersions } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
import {
  projectLaunchJurisdictionResearch,
  type LaunchJurisdictionResearch,
} from "@/domain/jurisdiction-launch-research";
import { listPublishedJurisdictionGuidance } from "./jurisdiction-profile.functions";

/** Authorized launch-side research read. No private notes, reviewer identities or raw drafts. */
export const listLaunchJurisdictionResearch = createServerFn({method:"GET"}).handler(async () => {
  const context = await getCommandContext(getRequest());
  assertCapability(context,"program.read");
  const published = await listPublishedJurisdictionGuidance();
  const rows = await db.select({
    jurisdictionId: jurisdictionProfileVersions.jurisdictionId,
    profile: jurisdictionProfileVersions.profile,
    evidence: jurisdictionProfileVersions.evidence,
    summary: jurisdictionProfileVersions.summary,
    status: jurisdictionProfileVersions.status,
    revision: jurisdictionProfileVersions.revision,
    publishedAt: jurisdictionProfileVersions.publishedAt,
  }).from(jurisdictionProfileVersions)
    .where(inArray(jurisdictionProfileVersions.status,["draft","in_review","published"]))
    .orderBy(desc(jurisdictionProfileVersions.createdAt));
  const output: Record<string,LaunchJurisdictionResearch> = {};
  for(const row of rows) {
    const authorizedPublication = published[row.jurisdictionId];
    // A published row with revoked, stale or missing independent verification
    // is not displayed as current guidance OR as unverified research.
    if(row.status==="published" &&
       (!authorizedPublication ||
        authorizedPublication.summary!==row.summary ||
        authorizedPublication.publishedAt!==row.publishedAt?.toISOString())) continue;
    const current = row.status==="published";
    const view = projectLaunchJurisdictionResearch(row,current);
    if(!view)continue;
    const previous = output[row.jurisdictionId];
    // Prefer a verified publication. Otherwise show the latest sourced review.
    if(!previous || (current && previous.guidanceStatus!=="verified_guidance"))
      output[row.jurisdictionId] = view;
  }
  return output;
});
