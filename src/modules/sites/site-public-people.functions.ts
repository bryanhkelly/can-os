import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and,eq,inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships,people,personProfileDetails,roleAssignments,sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { publicBioConsentSchema,readPublicBioConsent,readPublicStaffApprovals } from "@/domain/public-site-people";
import { changeOwnSiteBioConsent } from "./site-public-people-consent.server";
import { approvePublicSitePeople } from "./site-public-people.server";
import { requireSitePublisher } from "./site-publication.server";

const scope=z.object({siteId:z.string().uuid()}).strict();

export const changeMyPublicSiteBio=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.discriminatedUnion("action",[
    scope.extend({action:z.literal("consent"),
      displayName:publicBioConsentSchema.shape.displayName,
      publicTitle:publicBioConsentSchema.shape.publicTitle,
      biography:publicBioConsentSchema.shape.biography,
      expiresOn:publicBioConsentSchema.shape.expiresOn}),
    scope.extend({action:z.literal("revoke")}),
  ]).parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return changeOwnSiteBioConsent(actor,data);
  });

export const listPublicSitePeopleReview=createServerFn({method:"GET"})
  .validator((value:unknown)=>scope.parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    const site=await requireSitePublisher(actor,data.siteId);
    const [row]=await db.select({metadata:sites.metadata})
      .from(sites).where(eq(sites.id,site.id)).limit(1);
    const approval=readPublicStaffApprovals(row?.metadata??null);
    const candidates=await db.select({
      personId:people.id,metadata:personProfileDetails.metadata,
    }).from(roleAssignments)
      .innerJoin(people,eq(people.id,roleAssignments.personId))
      .innerJoin(memberships,and(
        eq(memberships.personId,people.id),
        eq(memberships.organizationId,site.organizationId),
      ))
      .innerJoin(personProfileDetails,eq(personProfileDetails.personId,people.id))
      .where(and(
        eq(people.active,true),
        eq(roleAssignments.organizationId,site.organizationId),
        eq(roleAssignments.siteId,site.id),
        inArray(roleAssignments.roleKey,[
          "teacher","registrar","site_admin","site_leader","site_staff",
          "room_facilitator","paraeducator","pastor","director","mentor",
        ]),
        activeRoleAssignmentPredicate(),
      )).limit(100);
    const available=[...new Map(candidates.flatMap(row=>{
      const consent=readPublicBioConsent(row.metadata,site.id);
      return consent?[[row.personId,{personId:row.personId,
        displayName:consent.displayName,publicTitle:consent.publicTitle,
        biography:consent.biography,expiresOn:consent.expiresOn}]] as const : [];
    })).values()];
    return {
      revision:approval?.revision??0,
      approvedPersonIds:approval?.entries.map(entry=>entry.personId)??[],
      candidates:available,
    };
  });

export const approveSitePeopleReview=createServerFn({method:"POST"})
  .validator((value:unknown)=>scope.extend({
    personIds:z.array(z.string().uuid()).max(20),
    expectedRevision:z.number().int().nonnegative(),
    reviewed:z.literal(true),reason:z.string().trim().min(10).max(500),
  }).parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return approvePublicSitePeople(actor,data);
  });
