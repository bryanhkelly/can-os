import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, organizations, people, programs,
  roleAssignments, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requireCurrentProgramSiteAuthorization } from "./program-site-authorization.server";

import { EventTypes } from "@/domain/event-types";
type AcademicStaffRole = "teacher" | "registrar";
const recordCapability = "academic_records.issue";
const origin = "can_academic_program_delegation";
const serviceFor = (role: AcademicStaffRole) => role === "teacher"
  ? ["academic_instruction", "curriculum"] as const
  : ["school_of_record", "academic_records", "credit_issuance"] as const;

async function scopedCANProgram(
  tx: Pick<typeof db,"select">, actor: AccessContext, programId: string,
) {
  if (actor.demoFacilitator || !actor.actorPersonId || actor.grantSiteId !== null ||
      actor.scope.organizationIds?.length !== 1)
    throw new AuthorizationError("verified independent CAN steward identity");
  const [row] = await tx.select({
    programId: programs.id, siteId: programs.siteId,
    hostId: programs.organizationId, hostType: organizations.type,
    institutionId: programs.academicProviderOrganizationId,
    issuerId: programs.creditIssuingOrganizationId,
    siteOwnerId: sites.organizationId,
    declaredHostId: programs.hostOrganizationId,
  }).from(programs)
    .innerJoin(organizations, eq(organizations.id,programs.organizationId))
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .where(eq(programs.id,programId)).limit(1);
  if (!row || !row.siteId || row.hostType !== "church" ||
      row.siteOwnerId !== row.hostId ||
      (row.declaredHostId && row.declaredHostId !== row.hostId) ||
      row.institutionId === row.hostId ||
      row.institutionId !== row.issuerId)
    throw new AuthorizationError("independently owned CAN-church academic Program");
  const [can] = await tx.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,row.institutionId)).limit(1);
  if(!can)throw new AuthorizationError("existing CAN institution");
  assertCANSteward(actor,can,"network.admins.provision");
  return row;
}

async function verifiedStaff(
  tx: Pick<typeof db,"select">, orgId:string, personId:string, role:AcademicStaffRole,
) {
  const [row] = await tx.select({
    personId:people.id,
  }).from(accountPersonGrants)
    .innerJoin(people,eq(people.id,accountPersonGrants.personId))
    .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.personId,personId),
      eq(accountPersonGrants.organizationId,orgId),
      isNull(accountPersonGrants.siteId),
      eq(accountPersonGrants.role,role),
      eq(accountPersonGrants.active,true),
      eq(accountPersonGrants.isSynthetic,false),
      eq(people.active,true),
      eq(accessAccounts.disabled,false),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    )).limit(1);
  if(!row)throw new AuthorizationError("existing verified original CAN employee account");
}

/** Does not create an account or auto-assign students, teachers or Sections. */
export async function delegateCANAcademicProgramStaff(
  actor:AccessContext,input:{
    programId:string;personId:string;role:AcademicStaffRole;reason:string;
  },
) {
  const reason=input.reason.trim();
  if(reason.length<10||reason.length>500)throw new Error("10–500 character authorization reason required");
  return db.transaction(async tx=>{
    // Program lock serializes grants and withdrawals without inventing a new
    // permission table or reusing the independent church's account membership.
    const [lock]=await tx.select({id:programs.id}).from(programs)
      .where(eq(programs.id,input.programId)).for("update").limit(1);
    if(!lock)throw new AuthorizationError("existing CAN service Program");
    const program=await scopedCANProgram(tx,actor,input.programId);
    if(actor.actorPersonId===input.personId)
      throw new AuthorizationError("CAN steward cannot delegate to themselves");
    await requireCurrentProgramSiteAuthorization(tx,input.programId,serviceFor(input.role));
    await verifiedStaff(tx,program.institutionId,input.personId,input.role);
    const [existing]=await tx.select().from(roleAssignments).where(and(
      eq(roleAssignments.personId,input.personId),
      eq(roleAssignments.organizationId,program.institutionId),
      eq(roleAssignments.programId,input.programId),
      isNull(roleAssignments.siteId),
      eq(roleAssignments.roleKey,input.role),
    )).limit(1);
    const capabilities=input.role==="registrar"?[recordCapability]:["academic_instruction"];
    let roleAssignmentId:string;
    if(existing){
      if(existing.metadata?.origin!==origin)
        throw new AuthorizationError("an existing independently managed CAN role must be reviewed separately");
      if(!existing.metadata?.revokedAt)return {roleAssignmentId:existing.id,created:false};
      const [restored]=await tx.update(roleAssignments).set({
        capabilities,
        metadata:{...existing.metadata,authorizedByPersonId:actor.actorPersonId,
          reason,contractService:serviceFor(input.role),revokedAt:null,
          revocationReason:null,revokedByPersonId:null},
        updatedAt:new Date(),
      }).where(eq(roleAssignments.id,existing.id)).returning({id:roleAssignments.id});
      if(!restored)throw new Error("Cannot restore exact academic Program role");
      roleAssignmentId=restored.id;
    }else{
      const [created]=await tx.insert(roleAssignments).values({
        personId:input.personId,organizationId:program.institutionId,
        siteId:null,programId:input.programId,roleKey:input.role,capabilities,
        metadata:{origin,authorizedByPersonId:actor.actorPersonId,
          reason,contractService:serviceFor(input.role)},
      }).returning({id:roleAssignments.id});
      if(!created)throw new Error("Cannot grant exact academic Program role");
      roleAssignmentId=created.id;
    }
    await writeAudit(tx,actor,{
      action:"can.academic_program_staff.delegated",
      entityType:"role_assignment",entityId:roleAssignmentId,
      scope:{organizationId:program.institutionId,siteId:program.siteId,
        programId:input.programId},
      after:{personId:input.personId,role:input.role,capabilities,reason},
    });
    await emitEvent(tx,{
      eventType:EventTypes.CANAcademicProgramStaffDelegated,
      aggregateType:"role_assignment",aggregateId:roleAssignmentId,
      actorPersonId:actor.actorPersonId,organizationId:program.institutionId,
      siteId:program.siteId,programId:input.programId,
      payload:{personId:input.personId,role:input.role},
    });
    return {roleAssignmentId,created:true};
  });
}

/** Revocation is always possible after a service contract lapses. The historic
 * assignment and its compliance evaluations are retained, never as a live role.
 */
export async function revokeCANAcademicProgramStaff(
  actor:AccessContext,input:{roleAssignmentId:string;reason:string},
) {
  const reason=input.reason.trim();
  if(reason.length<10||reason.length>500)throw new Error("10–500 character revocation reason required");
  return db.transaction(async tx=>{
    const [lookup]=await tx.select({
      id:roleAssignments.id,programId:roleAssignments.programId,
    }).from(roleAssignments).where(eq(roleAssignments.id,input.roleAssignmentId)).limit(1);
    if(!lookup?.programId)throw new AuthorizationError("existing delegated staff role");
    const [lock]=await tx.select({id:programs.id}).from(programs)
      .where(eq(programs.id,lookup.programId)).for("update").limit(1);
    if(!lock)throw new AuthorizationError("existing delegated academic Program");
    const program=await scopedCANProgram(tx,actor,lookup.programId);
    const [current]=await tx.select().from(roleAssignments)
      .where(eq(roleAssignments.id,input.roleAssignmentId)).limit(1);
    if(!current || current.programId!==program.programId ||
       current.organizationId!==program.institutionId ||
       current.siteId!==null || current.metadata?.origin!==origin ||
       current.metadata?.revokedAt || !["teacher","registrar"].includes(current.roleKey))
      throw new AuthorizationError("specific CAN-owned academic staff delegation");
    const revokedAt=new Date();
    await tx.update(roleAssignments).set({
      capabilities:[],
      metadata:{...current.metadata,revokedAt:revokedAt.toISOString(),
        revocationReason:reason,revokedByPersonId:actor.actorPersonId},
      updatedAt:revokedAt,
    }).where(eq(roleAssignments.id,current.id));
    await writeAudit(tx,actor,{
      action:"can.academic_program_staff.revoked",
      entityType:"role_assignment",entityId:current.id,
      scope:{organizationId:program.institutionId,siteId:program.siteId,
        programId:program.programId},
      before:{personId:current.personId,role:current.roleKey,capabilities:current.capabilities},
      after:{revoked:true,reason},
    });
    await emitEvent(tx,{
      eventType:EventTypes.CANAcademicProgramStaffRevoked,aggregateType:"role_assignment",
      aggregateId:current.id,actorPersonId:actor.actorPersonId,
      organizationId:program.institutionId,siteId:program.siteId,
      programId:program.programId,payload:{personId:current.personId,role:current.roleKey},
    });
    return {revoked:true};
  });
}

/** Only minimal CAN personnel identifiers are returned, never pupil records. */
export async function listCANAcademicProgramStaff(
  actor:AccessContext,programId:string,
) {
  const program=await scopedCANProgram(db,actor,programId);
  const [candidates,grants]=await Promise.all([
    db.select({
      personId:people.id,firstName:people.legalFirstName,
      lastName:people.legalLastName,role:accountPersonGrants.role,
    }).from(accountPersonGrants)
      .innerJoin(people,eq(people.id,accountPersonGrants.personId))
      .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
      .where(and(
        eq(accountPersonGrants.organizationId,program.institutionId),
        isNull(accountPersonGrants.siteId),
        inArray(accountPersonGrants.role,["teacher","registrar"]),
        eq(accountPersonGrants.active,true),eq(accountPersonGrants.isSynthetic,false),
        eq(people.active,true),eq(accessAccounts.disabled,false),
        sql`${accessAccounts.emailVerifiedAt} is not null`,
      )).orderBy(asc(people.legalLastName)).limit(101),
    db.select({
      id:roleAssignments.id,personId:roleAssignments.personId,
      role:roleAssignments.roleKey,metadata:roleAssignments.metadata,
    }).from(roleAssignments)
      .where(and(eq(roleAssignments.organizationId,program.institutionId),
        eq(roleAssignments.programId,programId),
        isNull(roleAssignments.siteId),
        inArray(roleAssignments.roleKey,["teacher","registrar"]),
        activeRoleAssignmentPredicate(),
      )).limit(101),
  ]);
  return {
    programId,siteId:program.siteId,
    candidates:candidates.slice(0,100).filter(c=>c.personId!==actor.actorPersonId),
    current:grants.filter(g=>g.metadata?.origin===origin)
      .map(({metadata,...g})=>g),
    truncated:candidates.length>100||grants.length>100,
  };
}
