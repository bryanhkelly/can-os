import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,eq,gt,ilike,lte,or,isNull,asc} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {canonicalEnrollmentOrganizations,networkMemberships,networkUnits} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {readEligibleSelfEnrollmentReleases} from "./noncredit-self-enrollment-catalog.server";

const input=z.object({
  releaseId:z.string().uuid(),
  query:z.string().trim().min(2).max(80),
}).strict();

/** Verified network organization affiliations explicitly opted into directory
 * discovery. This does not verify a registrant's individual church membership
 * or grant access to any other organization's private records. */
export const findNoncreditEnrollmentAffiliates=createServerFn({method:"GET"})
  .validator((value:unknown)=>input.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {requireVerifiedAdultAccount}=await import("./noncredit-self-enrollment-identity.server");
    await requireVerifiedAdultAccount();
    const [release]=await readEligibleSelfEnrollmentReleases(db,data.releaseId);
    if(!release)throw new AuthorizationError("currently eligible enrollment release");
    const now=new Date();
    const safeQuery=data.query.replace(/[\\%_]/g,character=>"\\"+character);
    const rows=await db.select({
      id:networkMemberships.id,
      organizationName:canonicalEnrollmentOrganizations.displayName,
      reportingUnitName:networkUnits.name,
    }).from(networkMemberships)
      .innerJoin(canonicalEnrollmentOrganizations,
        eq(canonicalEnrollmentOrganizations.id,networkMemberships.memberOrganizationId))
      .innerJoin(networkUnits,eq(networkUnits.id,networkMemberships.reportingUnitId))
      .where(and(
        or(
          eq(networkMemberships.networkOrganizationId,release.providerOrganizationId),
          eq(networkMemberships.networkOrganizationId,release.registeringOrganizationId),
        ),
        eq(networkMemberships.status,"approved"),
        eq(networkMemberships.directoryVisible,true),
        eq(canonicalEnrollmentOrganizations.status,"active"),
        eq(networkUnits.status,"active"),
        lte(networkMemberships.validFrom,now),
        or(isNull(networkMemberships.validThrough),gt(networkMemberships.validThrough,now)),
        ilike(canonicalEnrollmentOrganizations.displayName,"%"+safeQuery+"%"),
      ))
      .orderBy(asc(canonicalEnrollmentOrganizations.displayName)).limit(21);
    return {items:rows.slice(0,20),hasMore:rows.length>20};
  });
