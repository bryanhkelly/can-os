import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, organizations, sites, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { writeAudit } from "@/platform/mutation";
import { getVerifiedPlatformOwnerSession } from "./platform-owner-delegation.server";
import { ownerGrantRequiresSite, ownerPilotGrantInput, ownerPilotRoles } from "@/domain/platform-owner-pilot-roles";

/** Pilot staffing does not create Course appointments, approvals or learner consent. */

export async function readOwnerPilotLocations(request: Request) {
  await getVerifiedPlatformOwnerSession(request);
  const [orgs, locationRows] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name,
      type: organizations.type, lifecycleStatus: organizations.lifecycleStatus,
    }).from(organizations).orderBy(organizations.name).limit(101),
    db.select({ id: sites.id, name: sites.name, organizationId: sites.organizationId,
      lifecycleStatus: sites.lifecycleStatus,
    }).from(sites).orderBy(sites.name).limit(201),
  ]);
  return { organizations: orgs.slice(0,100), sites: locationRows.slice(0,200),
    organizationsLimited: orgs.length>100, sitesLimited: locationRows.length>200 };
}

export async function provisionOwnerPilotRole(request: Request, raw: unknown) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AuthorizationError("same-origin owner role assignment");
  const owner = await getVerifiedPlatformOwnerSession(request);
  if (owner.delegatedGrantId && owner.delegatedUntil && owner.delegatedUntil>new Date())
    throw new AuthorizationError("return to Platform Owner before assigning roles");
  const data = ownerPilotGrantInput.parse(raw);
  if (ownerGrantRequiresSite(data.role)!==Boolean(data.siteId))
    throw new AuthorizationError("role requires exact Site or organization-only scope");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"owner-pilot-role:"+
      data.accountId+":"+data.organizationId+":"+data.role+":"+(data.siteId??"organization")}))`);
    const [target] = await tx.select({
      accountId: accessAccounts.id, personId: accessAccounts.personId,
      verified: accessAccounts.emailVerifiedAt, disabled: accessAccounts.disabled,
      email: accessAccounts.emailNormalized, personActive: people.active,
    }).from(accessAccounts)
      .innerJoin(people, eq(people.id,accessAccounts.personId))
      .where(eq(accessAccounts.id,data.accountId)).limit(1);
    if (!target?.personId || !target.personActive || !target.verified ||
        target.disabled || target.accountId===owner.ownerAccountId ||
        isDemoAccountEmail(target.email))
      throw new AuthorizationError("other active verified pilot Person");
    const [org] = await tx.select({id:organizations.id,lifecycleStatus:organizations.lifecycleStatus})
      .from(organizations).where(eq(organizations.id,data.organizationId)).limit(1);
    if (!org || org.lifecycleStatus!=="active")
      throw new AuthorizationError("active approved pilot Organization");
    if (data.siteId) {
      const [site] = await tx.select({id:sites.id}).from(sites).where(and(
        eq(sites.id,data.siteId),eq(sites.organizationId,data.organizationId),
      )).limit(1);
      if (!site) throw new AuthorizationError("Site belongs to the selected Organization");
    }
    const conflicting = await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants)
      .where(and(eq(accountPersonGrants.accountId,target.accountId),
        eq(accountPersonGrants.active,true),ne(accountPersonGrants.personId,target.personId)))
      .limit(1);
    if (conflicting.length) throw new AuthorizationError("one verified account Person");
    const existing = await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants)
      .where(and(eq(accountPersonGrants.accountId,target.accountId),
        eq(accountPersonGrants.personId,target.personId),
        eq(accountPersonGrants.role,data.role),
        eq(accountPersonGrants.organizationId,data.organizationId),
        data.siteId?eq(accountPersonGrants.siteId,data.siteId):isNull(accountPersonGrants.siteId),
        eq(accountPersonGrants.active,true))).limit(1);
    if (existing.length) return {grantId:existing[0]!.id,created:false};
    const [created] = await tx.insert(accountPersonGrants).values({
      accountId:target.accountId,personId:target.personId,role:data.role,
      organizationId:data.organizationId,siteId:data.siteId,active:true,
    }).returning({id:accountPersonGrants.id});
    if (!created) throw new AuthorizationError("pilot grant persistence");
    await writeAudit(tx,{
      actorPersonId:owner.ownerPersonId,
      action:"platform.owner.pilot_role.provisioned",
      resourceType:"account_person_grant",resourceId:created.id,
      scope:{organizationId:data.organizationId,siteId:data.siteId},
      context:{ownerAccountId:owner.ownerAccountId,targetAccountId:target.accountId,
        targetPersonId:target.personId,grantedRole:data.role,reason:data.reason,
        authority:"platform-owner-pilot-setup",independentCourseAppointmentCreated:false},
    });
    return {grantId:created.id,created:true};
  });
}

/** Revoke only one of the tightly scoped first-wave pilot grants.
 * Full user and professional-appointment governance remains a separate workstream.
 */
export async function revokeOwnerPilotRole(request:Request,raw:unknown) {
  if(request.headers.get("origin")!==new URL(request.url).origin)
    throw new AuthorizationError("same-origin owner role revocation");
  const owner=await getVerifiedPlatformOwnerSession(request);
  if(owner.delegatedGrantId && owner.delegatedUntil && owner.delegatedUntil>new Date())
    throw new AuthorizationError("return to Platform Owner before revocation");
  const input=z.object({
    grantId:z.string().uuid(),reason:z.string().trim().min(12).max(500),
  }).strict().parse(raw);
  return db.transaction(async tx=>{
    const [grant]=await tx.select({
      id:accountPersonGrants.id,accountId:accountPersonGrants.accountId,
      personId:accountPersonGrants.personId,role:accountPersonGrants.role,
      organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId,
    }).from(accountPersonGrants).where(and(
      eq(accountPersonGrants.id,input.grantId),eq(accountPersonGrants.active,true),
    )).limit(1).for("update");
    if(!grant||grant.accountId===owner.ownerAccountId||
       !ownerPilotRoles.includes(grant.role as (typeof ownerPilotRoles)[number])||
       !grant.organizationId)
      throw new AuthorizationError("current eligible scoped pilot role");
    const [changed]=await tx.update(accountPersonGrants).set({active:false})
      .where(and(eq(accountPersonGrants.id,grant.id),eq(accountPersonGrants.active,true)))
      .returning({id:accountPersonGrants.id});
    if(!changed)throw new AuthorizationError("current eligible scoped pilot role");
    await writeAudit(tx,{
      actorPersonId:owner.ownerPersonId,action:"platform.owner.pilot_role.revoked",
      resourceType:"account_person_grant",resourceId:grant.id,
      scope:{organizationId:grant.organizationId,siteId:grant.siteId},
      context:{ownerAccountId:owner.ownerAccountId,targetAccountId:grant.accountId,
        targetPersonId:grant.personId,role:grant.role,reason:input.reason},
    });
    return {revoked:true};
  });
}
