import { and,eq,sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships,people,personProfileDetails,roleAssignments,sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { publicBioConsentSchema,publicBioConsentsSchema } from "@/domain/public-site-people";
import { writeAudit } from "@/platform/mutation";

const permittedStaffRoles=["teacher","registrar","site_admin","site_leader",
  "site_staff","room_facilitator","paraeducator","pastor","director","mentor"];

/** Live relationship; no guardian/student profile is automatically public. */
export async function assertActiveSiteStaffPerson(
  personId:string,siteId:string,
  executor:Pick<typeof db,"select">=db,
) {
  const [site]=await executor.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if(!site)throw new AuthorizationError("known Site");
  const [staff]=await executor.select({personId:people.id})
    .from(roleAssignments)
    .innerJoin(people,eq(people.id,roleAssignments.personId))
    .innerJoin(memberships,and(
      eq(memberships.personId,people.id),
      eq(memberships.organizationId,site.organizationId),
    )).where(and(
      eq(people.id,personId),eq(people.active,true),
      eq(roleAssignments.organizationId,site.organizationId),
      eq(roleAssignments.siteId,siteId),
      activeRoleAssignmentPredicate(),
    )).limit(100);
  // Role assignments are domain records; never infer this from login grants.
  const roles=await executor.select({role:roleAssignments.roleKey})
    .from(roleAssignments).where(and(
      eq(roleAssignments.personId,personId),
      eq(roleAssignments.organizationId,site.organizationId),
      eq(roleAssignments.siteId,siteId),
      activeRoleAssignmentPredicate(),
    ));
  if(!staff || !roles.some(item=>permittedStaffRoles.includes(item.role)))
    throw new AuthorizationError("active staff relationship at this Site");
  return site;
}

export async function changeOwnSiteBioConsent(
  actor:AccessContext,input:{
    siteId:string;action:"consent"|"revoke";
    displayName?:string;publicTitle?:string;biography?:string;expiresOn?:string;
  },
) {
  if(!actor.actorPersonId)throw new AuthorizationError("person-owned public bio consent");
  const personId=actor.actorPersonId;
  return db.transaction(async tx=>{
    const site=await assertActiveSiteStaffPerson(personId,input.siteId,tx);
    // Serializes first-time inserts and concurrent consent withdrawals.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"public-bio:"+personId}))`);
    const [current]=await tx.select().from(personProfileDetails)
      .where(eq(personProfileDetails.personId,personId)).for("update").limit(1);
    const existing=publicBioConsentsSchema.safeParse(current?.metadata.publicBioConsents);
    const old=existing.success?existing.data:[];
    const consents=old.filter(item=>item.siteId!==site.id);
    if(input.action==="consent"){
      const record=publicBioConsentSchema.parse({
        version:1,siteId:site.id,
        displayName:input.displayName,publicTitle:input.publicTitle,
        biography:input.biography,
        expiresOn:input.expiresOn,consentedAt:new Date().toISOString(),
      });
      if(record.expiresOn<new Date().toISOString().slice(0,10))
        throw new Error("Choose a future bio permission expiry");
      consents.push(record);
    }
    const metadata={...(current?.metadata??{}),publicBioConsents:consents};
    if(current){
      await tx.update(personProfileDetails).set({metadata,
        updatedAt:new Date()}).where(eq(personProfileDetails.id,current.id));
    }else{
      await tx.insert(personProfileDetails).values({
        personId,metadata,visibility:"internal",
      });
    }
    await writeAudit(tx,actor,{
      action:input.action==="consent"?"person.public_bio.consent":"person.public_bio.revoke",
      entityType:"person",entityId:personId,
      scope:{organizationId:site.organizationId,siteId:site.id},
      after:{permission:input.action,siteId:site.id,
        expiresOn:input.action==="consent"?input.expiresOn:null},
    });
    return {siteId:site.id,consented:input.action==="consent"};
  });
}
