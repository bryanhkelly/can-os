import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, applications, householdMemberships, households,
  people, programs, studentProfiles,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { startFamilyApplication } from "./enrollment-service";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

/**
 * Authenticated guardian entry. Public website visitors remain unverified
 * inquiries: no anonymous child creation or inferred guardian authority here.
 */
async function signedInFamilyApplicant() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "guardian" || !actor.actorPersonId || actor.demoFacilitator)
    throw new AuthorizationError("real signed-in family guardian");
  assertCapability(actor, "enrollment.apply");
  const [account] = await db.select({emailVerifiedAt:accessAccounts.emailVerifiedAt})
    .from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
  if (!account?.emailVerifiedAt)
    throw new AuthorizationError("verified family email sign-in required");
  return actor;
}

const uuid = z.string().uuid();
const applicationInput = z.object({
  requestId: uuid,
  programId: uuid,
  householdId: uuid.optional(),
  studentFirstName: z.string().trim().min(1).max(100),
  studentLastName: z.string().trim().min(1).max(100),
  gradeLevel: z.string().trim().min(1).max(10),
}).strict();

/** Read only programs in this guardian's original verified membership scope.
 * An approved agreement does not grant a new guardian membership.
 */
export const getGuardianFamilyApplicationWorkspace = createServerFn({method:"GET"})
  .handler(async () => {
    setResponseHeader("Cache-Control","private, no-store");
    const actor = await signedInFamilyApplicant();
    const programIds=actor.scope.programIds??[];
    const organizationIds=actor.scope.organizationIds??[];
    const siteIds=actor.scope.siteIds??[];
    if(!programIds.length || !organizationIds.length || !siteIds.length)
      return {programs:[],applications:[],households:[]};
    const available=await db.select({
      id:programs.id,name:programs.name,siteId:programs.siteId,
    }).from(programs).where(and(
      inArray(programs.id,programIds),
      inArray(programs.organizationId,organizationIds),
      inArray(programs.siteId,siteIds),
      eq(programs.status,"active"),
    )).orderBy(programs.name);
    const verified=await Promise.all(available.map(async program=>{
      try {
        await requireChurchHostedOperatingServices(db,program.id,["admissions","school_of_record"]);
        return program;
      } catch(error) {
        if(error instanceof AuthorizationError)return null;
        throw error;
      }
    }));
    const activePrograms=verified.filter((program):program is NonNullable<typeof program>=>program!==null);
    const existing=await db.select({
      applicationId:applications.id,programId:applications.programId,
      programName:programs.name,studentFirstName:people.legalFirstName,
      studentLastName:people.legalLastName,stage:applications.stage,
      updatedAt:applications.updatedAt,
    }).from(applications)
      .innerJoin(programs,eq(programs.id,applications.programId))
      .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
      .innerJoin(people,eq(people.id,studentProfiles.personId))
      .where(and(eq(applications.submittedByPersonId,actor.actorPersonId),
        inArray(applications.programId,programIds),
        inArray(programs.organizationId,organizationIds),
        inArray(programs.siteId,siteIds)))
      .orderBy(desc(applications.updatedAt)).limit(100);
    const families=await db.select({id:households.id,name:households.displayName})
      .from(householdMemberships)
      .innerJoin(households,eq(households.id,householdMemberships.householdId))
      .where(eq(householdMemberships.personId,actor.actorPersonId))
      .orderBy(households.displayName).limit(100);
    return {programs:activePrograms, applications:existing.map(row=>({
      ...row,updatedAt:row.updatedAt.toISOString(),
    })),households:families};
  });

/** This calls the existing canonical Application/Journey transaction.
 * The underlying service rechecks active Program, Site, and CAN authority
 * inside the same transaction as the student/household/application writes.
 */
export const startGuardianFamilyApplication = createServerFn({method:"POST"})
  .validator((input:unknown)=>applicationInput.parse(input))
  .handler(async ({data})=>{
    const actor=await signedInFamilyApplicant();
    if(!actor.scope.programIds?.includes(data.programId))
      throw new AuthorizationError("authorized family school program");
    const result=await startFamilyApplication(actor,{
      programId:data.programId,
      idempotencyKey:`guardian-application:${actor.actorPersonId}:${data.requestId}`,
      ...(data.householdId?{householdId:data.householdId}:{}),
      student:{legalFirstName:data.studentFirstName,legalLastName:data.studentLastName,
        gradeLevel:data.gradeLevel},
      guardianRelationshipLabel:"parent_or_legal_guardian_unverified",
      parentSelfService:true,
    });
    return {applicationId:result.applicationId};
  });
