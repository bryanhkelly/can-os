import {and,eq,gt,isNull,lte,or} from "drizzle-orm";
import type {db} from "@/db/client";
import {networkMemberships,participationAttributions} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClassSource={classId:string;siteId:string|null;operatingOrganizationId:string};

/** Record immutable attribution only for an already authorized Class
 * admission. An optional learner-reported affiliation is independently
 * validated against the current provider's directory. It grants no access. */
export async function writeNativeClassAttribution(tx:Tx,input:{
  enrollmentId:string;source:ClassSource;networkMembershipId?:string;now:Date;
}):Promise<void>{
  const {source,networkMembershipId,now}=input;
  if(!source.siteId)throw new AuthorizationError("Class attribution requires its authorized Site");
  const [membership]=networkMembershipId?await tx.select({
    id:networkMemberships.id,memberOrganizationId:networkMemberships.memberOrganizationId,
  }).from(networkMemberships).where(and(
    eq(networkMemberships.id,networkMembershipId),
    eq(networkMemberships.status,"approved"),
    eq(networkMemberships.directoryVisible,true),
    eq(networkMemberships.networkOrganizationId,source.operatingOrganizationId),
    lte(networkMemberships.validFrom,now),
    or(isNull(networkMemberships.validThrough),gt(networkMemberships.validThrough,now)),
  )).limit(1):[];
  if(networkMembershipId&&!membership)throw new AuthorizationError("approved directory-visible network affiliate");
  await tx.insert(participationAttributions).values({
    classEnrollmentId:input.enrollmentId,
    deliverySiteId:source.siteId,reportingSiteId:source.siteId,
    creditedOrganizationId:membership?.memberOrganizationId??source.operatingOrganizationId,
    networkMembershipId:membership?.id??null,
    attributionBasis:membership?"self_reported":"provider_default",
    relationshipSnapshot:membership?{}:{
      kind:"provider_default",classId:source.classId,
      organizationId:source.operatingOrganizationId,siteId:source.siteId,
    },
  });
}
