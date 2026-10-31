import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, admissionSeatPools, applications, actions, guardianRelationships,
  householdMemberships, households, people, programs, schoolYears, studentProfiles,
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
  return { ...actor, actorPersonId: actor.actorPersonId };
}

const uuid = z.string().uuid();
const applicationInput = z.object({
  requestId: uuid,
  programId: uuid,
  householdId: uuid.optional(),
  schoolYearId: uuid.optional(),
  studentProfileId: uuid.optional(),
  originTransferActionId: uuid.optional(),
  confirmedTransferDestination: z.literal(true).optional(),
  destinationRecordsReleaseAuthorized:z.literal(true).optional(),
  familyStartRequestId: uuid.optional(),
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
      return {programs:[],applications:[],households:[],students:[],transferRequests:[]};
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
    const yearRows=activePrograms.length?await db.select({
      programId:admissionSeatPools.programId,id:schoolYears.id,name:schoolYears.name,
    }).from(admissionSeatPools)
      .innerJoin(programs,eq(programs.id,admissionSeatPools.programId))
      .innerJoin(schoolYears,eq(schoolYears.id,admissionSeatPools.schoolYearId))
      .where(and(
        inArray(admissionSeatPools.programId,activePrograms.map(program=>program.id)),
        eq(schoolYears.status,"active"),
        eq(schoolYears.organizationId,programs.organizationId),
        eq(schoolYears.siteId,programs.siteId),
        or(isNull(schoolYears.programId),eq(schoolYears.programId,programs.id)),
      )).orderBy(schoolYears.name):[];
    const programsWithYears=activePrograms.map(program=>({...program,
      schoolYears:yearRows.filter(year=>year.programId===program.id)
        .map(({id,name})=>({id,name}))}));

    // A registrar may have created an inquiry on behalf of a family.
    // The adult can resume it only AFTER the precise child relationship is
    // independently verified. Own submissions remain visible while pending.
    const verifiedRelations=await db.select({studentPersonId:guardianRelationships.studentPersonId})
      .from(guardianRelationships).where(and(
        eq(guardianRelationships.guardianPersonId,actor.actorPersonId),
        eq(guardianRelationships.canManageEnrollment,true),
        sql`${guardianRelationships.metadata}->>'verification' = 'verified'`,
      ));
    const verifiedStudentIds=verifiedRelations.map(row=>row.studentPersonId);
    const existing=await db.select({
      applicationId:applications.id,programId:applications.programId,
      programName:programs.name,studentPersonId:studentProfiles.personId,
      studentFirstName:people.legalFirstName,
      studentLastName:people.legalLastName,stage:applications.stage,
      metadata:applications.metadata,siteId:programs.siteId,
      updatedAt:applications.updatedAt,
    }).from(applications)
      .innerJoin(programs,eq(programs.id,applications.programId))
      .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
      .innerJoin(people,eq(people.id,studentProfiles.personId))
      .where(and(or(eq(applications.submittedByPersonId,actor.actorPersonId),
          ...(verifiedStudentIds.length?[inArray(studentProfiles.personId,verifiedStudentIds)]:[])),
        inArray(applications.programId,programIds),
        inArray(programs.organizationId,organizationIds),
        inArray(programs.siteId,siteIds)))
      .orderBy(desc(applications.updatedAt)).limit(100);
    const families=await db.select({id:households.id,name:households.displayName})
      .from(householdMemberships)
      .innerJoin(households,eq(households.id,householdMemberships.householdId))
      .where(eq(householdMemberships.personId,actor.actorPersonId))
      .orderBy(households.displayName).limit(100);
    const verifiedStudents=verifiedStudentIds.length?await db.select({
      studentProfileId:studentProfiles.id,studentPersonId:studentProfiles.personId,
      studentFirstName:people.legalFirstName,studentLastName:people.legalLastName,
      gradeLevel:studentProfiles.gradeLevel,
    }).from(studentProfiles).innerJoin(people,eq(people.id,studentProfiles.personId))
      .where(and(inArray(studentProfiles.personId,verifiedStudentIds),eq(people.active,true))):[];
    const sharedMemberships=verifiedStudentIds.length&&families.length?await db.select({
      studentPersonId:householdMemberships.personId,householdId:householdMemberships.householdId,
    }).from(householdMemberships).where(and(
      inArray(householdMemberships.personId,verifiedStudentIds),
      inArray(householdMemberships.householdId,families.map(family=>family.id)),
    )):[];
    const students=verifiedStudents.flatMap(student=>sharedMemberships
      .filter(membership=>membership.studentPersonId===student.studentPersonId)
      .map(membership=>({...student,householdId:membership.householdId,
        gradeLevel:student.gradeLevel??""})));
    // The guardian's verified relationship remains independent of whether
    // the origin school still grants a login after the student transfers.
    const transferRows=verifiedStudents.length?await db.select({
      id:actions.id,metadata:actions.metadata,status:actions.status,
      studentProfileId:studentProfiles.id,originProgramId:actions.programId,
      originSchoolName:programs.name,
    }).from(actions)
      .innerJoin(studentProfiles,eq(studentProfiles.id,actions.subjectId))
      .innerJoin(programs,eq(programs.id,actions.programId))
      .where(and(eq(actions.type,"guardian_enrollment_change_request"),
        eq(actions.subjectType,"student_profile"),
        inArray(actions.subjectId,verifiedStudents.map(row=>row.studentProfileId)),
      )).orderBy(desc(actions.createdAt)).limit(100):[];
    const transferRequests=transferRows.filter(row=>
      row.metadata.kind==="transfer"&&
      row.metadata.requestedByGuardianPersonId===actor.actorPersonId&&
      typeof row.metadata.destinationSchoolName==="string"&&
      typeof row.metadata.recordsReleaseConsentId==="string"&&
      row.status!=="cancelled"
    ).map(row=>({
      id:row.id,studentProfileId:row.studentProfileId,
      originProgramId:row.originProgramId,
      originSchoolName:row.originSchoolName,
      destinationSchoolName:row.metadata.destinationSchoolName as string,
      destinationFamilyStartRequestId:
        typeof row.metadata.destinationFamilyStartRequestId==="string"?
        row.metadata.destinationFamilyStartRequestId:null,
      destinationFamilyStartProgramId:
        typeof row.metadata.destinationFamilyStartProgramId==="string"?
        row.metadata.destinationFamilyStartProgramId:null,
      originExited:row.status==="resolved"&&row.metadata.exitCompletedByRegistrar===true,
    }));
    const applicationYearIds=[...new Set(existing.map(row=>
      typeof row.metadata.schoolYearId==="string"?row.metadata.schoolYearId:null)
      .filter((id):id is string=>!!id))];
    const applicationYears=applicationYearIds.length?await db.select({id:schoolYears.id,
      name:schoolYears.name}).from(schoolYears).where(inArray(schoolYears.id,applicationYearIds)):[];
    const verifiedIds=new Set(verifiedStudentIds);
    return {programs:programsWithYears, applications:existing.map(row=>({
      applicationId:row.applicationId,programId:row.programId,programName:row.programName,
      studentPersonId:row.studentPersonId,studentFirstName:row.studentFirstName,
      studentLastName:row.studentLastName,stage:row.stage,siteId:row.siteId,
      source:typeof row.metadata.source==="string"?row.metadata.source:null,
      schoolYearId:typeof row.metadata.schoolYearId==="string"?row.metadata.schoolYearId:null,
      schoolYearName:applicationYears.find(year=>year.id===row.metadata.schoolYearId)?.name??null,
      guardianVerified:verifiedIds.has(row.studentPersonId),
      originTransferActionId:typeof row.metadata.originTransferActionId==="string"?
        row.metadata.originTransferActionId:null,
      updatedAt:row.updatedAt.toISOString(),
    })),households:families,students,transferRequests};
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
      ...(data.schoolYearId?{schoolYearId:data.schoolYearId}:{}),
      ...(data.studentProfileId?{existingStudentProfileId:data.studentProfileId}:{}),
      ...(data.originTransferActionId?{originTransferActionId:data.originTransferActionId,
        confirmedTransferDestination:data.confirmedTransferDestination,
        destinationRecordsReleaseAuthorized:data.destinationRecordsReleaseAuthorized}:{}),
      ...(data.familyStartRequestId?{familyStartRequestId:data.familyStartRequestId}:{}),
      source:data.familyStartRequestId?"published_site":"family_account",
      student:{legalFirstName:data.studentFirstName,legalLastName:data.studentLastName,
        gradeLevel:data.gradeLevel},
      guardianRelationshipLabel:"parent_or_legal_guardian_unverified",
      parentSelfService:true,
    });
    return {applicationId:result.applicationId};
  });
