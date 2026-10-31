import { db,type Database } from "@/db/client";
import { accessAccounts,accountPersonGrants,admissionOffers,applications,actions,enrollments,guardianRelationships,householdMemberships,households,journeyRequirements,journeys,people,programs,publicAdmissionsInterests,studentProfiles } from "@/db/schema";
import { lockAdmissionsApplication } from "@/domain/admissions-application-lock";
import { offerHoldsSeat } from "@/domain/admissions-policy";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { assertPublicInterestConversion } from "@/domain/public-interest-conversion";
import { applicationGuardianContact } from "@/domain/application-guardian-contact";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { assertRecordWriteAllowed } from "@/modules/_demo/record-write-gate";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { instantiateJourneyFromDefinition } from "@/modules/journeys/instantiate";
import { enrollmentJourneyDefinitionKey } from "@/domain/enrollment-form";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { resolvePrivateFamilyStartDestination } from "./private-family-start.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,asc,desc,eq,ilike,inArray,isNull,or,sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
const uuid=z.string().uuid();
const existingStudentSchema=z.object({
 studentProfileId:uuid,guardianPersonId:uuid,householdId:uuid.optional(),createHousehold:z.literal(true).optional(),
}).strict().refine(student=>Boolean(student.householdId)!==Boolean(student.createHousehold),
 "Select an existing household or explicitly confirm creating a missing household");
const inquiryDetails=z.object({
 requestId:uuid,programId:uuid,source:z.string().trim().max(80).default("school_direct"),
 notes:z.string().trim().max(3000).optional(),
});
const applicant=z.union([
 inquiryDetails.extend({existingStudent:existingStudentSchema,existingApplicationId:z.never().optional(),
  publicInterestId:z.never().optional(),contactReviewed:z.never().optional()}).strict(),
 inquiryDetails.extend({
  existingStudent:z.never().optional(),existingApplicationId:uuid.optional(),
  publicInterestId:uuid.optional(),contactReviewed:z.literal(true).optional(),
  studentFirstName:z.string().trim().min(1).max(100),studentLastName:z.string().trim().min(1).max(100),
  gradeLevel:z.string().trim().max(10).optional(),guardianFirstName:z.string().trim().min(1).max(100),
  guardianLastName:z.string().trim().min(1).max(100),guardianEmail:z.string().trim().email(),
 }).strict(),
]);
export const registrar=createServerOnlyFn(async()=>{
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.organizationIds?.length)throw new AuthorizationError("admissions registrar");
 assertCapability(actor,"enrollment.decide");
 return actor;
});
export const listAdmissionsIntakePrograms=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.organizationIds?.length)
  throw new AuthorizationError("admissions registrar");
 assertCapability(actor,"enrollment.decide");
 return db.select({id:programs.id,name:programs.name,siteId:programs.siteId}).from(programs)
  .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
    ...(actor.scope.programIds ? [inArray(programs.id,actor.scope.programIds)] : []),
    ...(actor.scope.siteIds ? [inArray(programs.siteId,actor.scope.siteIds)] : [])))
  .orderBy(programs.name);
});
const intakeGuardian=alias(people,"intake_guardian");
const guardianHousehold=alias(householdMemberships,"intake_guardian_household");
async function existingStudentChoices(database:Pick<Database,"selectDistinct">,
 actor:Awaited<ReturnType<typeof registrar>>,programId?:string,student?:z.infer<typeof existingStudentSchema>){
 return database.selectDistinct({
  programId:programs.id,siteId:programs.siteId,studentProfileId:studentProfiles.id,
  studentFirstName:people.legalFirstName,studentLastName:people.legalLastName,
  guardianPersonId:intakeGuardian.id,guardianFirstName:intakeGuardian.legalFirstName,
  guardianLastName:intakeGuardian.legalLastName,householdId:householdMemberships.householdId,
 }).from(studentProfiles)
  .innerJoin(people,eq(people.id,studentProfiles.personId))
  .innerJoin(enrollments,and(eq(enrollments.studentProfileId,studentProfiles.id),eq(enrollments.status,"active")))
  .innerJoin(programs,and(eq(programs.id,enrollments.programId),eq(programs.organizationId,enrollments.organizationId)))
  .innerJoin(guardianRelationships,guardianRelationshipPredicate({studentPersonId:people.id,access:"enrollment"}))
  .innerJoin(intakeGuardian,eq(intakeGuardian.id,guardianRelationships.guardianPersonId))
  .leftJoin(householdMemberships,eq(householdMemberships.personId,people.id))
  .leftJoin(guardianHousehold,eq(guardianHousehold.personId,intakeGuardian.id))
  .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
   ...(actor.scope.programIds ? [inArray(programs.id,actor.scope.programIds)] : []),
   ...(actor.scope.siteIds ? [inArray(programs.siteId,actor.scope.siteIds)] : []),
   eq(people.active,true),eq(intakeGuardian.active,true),
   or(eq(householdMemberships.householdId,guardianHousehold.householdId),
    and(isNull(householdMemberships.id),isNull(guardianHousehold.id))),
   programId?eq(programs.id,programId):undefined,
   student?and(eq(studentProfiles.id,student.studentProfileId),eq(intakeGuardian.id,student.guardianPersonId),
    student.householdId?eq(householdMemberships.householdId,student.householdId):undefined):undefined))
  .orderBy(people.legalLastName,people.legalFirstName,studentProfiles.id).limit(300);
}
/** Search active students and verified guardians without loading an unbounded directory. */
const admissionsPageInput=z.object({
 siteId:uuid.optional(),programId:uuid.optional(),cursor:uuid.optional(),
 search:z.string().trim().max(100).optional(),applicationId:uuid.optional(),
 pageSize:z.coerce.number().int().min(1).max(100).default(40),
}).strict();
export const listAdmissionsExistingStudentsPage=createServerFn({method:"GET"})
 .validator((value:unknown)=>admissionsPageInput.omit({cursor:true}).extend({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(value??{}))
 .handler(async({data})=>{
  const actor=await registrar();
  const rows=await db.selectDistinct({
   programId:programs.id,siteId:programs.siteId,studentProfileId:studentProfiles.id,
   studentFirstName:people.legalFirstName,studentLastName:people.legalLastName,
   guardianPersonId:intakeGuardian.id,guardianFirstName:intakeGuardian.legalFirstName,
   guardianLastName:intakeGuardian.legalLastName,householdId:householdMemberships.householdId,
  }).from(studentProfiles)
   .innerJoin(people,eq(people.id,studentProfiles.personId))
   .innerJoin(enrollments,and(eq(enrollments.studentProfileId,studentProfiles.id),eq(enrollments.status,"active")))
   .innerJoin(programs,and(eq(programs.id,enrollments.programId),eq(programs.organizationId,enrollments.organizationId)))
   .innerJoin(guardianRelationships,guardianRelationshipPredicate({studentPersonId:people.id,access:"enrollment"}))
   .innerJoin(intakeGuardian,eq(intakeGuardian.id,guardianRelationships.guardianPersonId))
   .leftJoin(householdMemberships,eq(householdMemberships.personId,people.id))
   .leftJoin(guardianHousehold,eq(guardianHousehold.personId,intakeGuardian.id))
   .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
    ...(actor.scope.programIds?[inArray(programs.id,actor.scope.programIds)]:[]),
    ...(actor.scope.siteIds?[inArray(programs.siteId,actor.scope.siteIds)]:[]),
    data.siteId?eq(programs.siteId,data.siteId):undefined,
    data.programId?eq(programs.id,data.programId):undefined,
    eq(people.active,true),eq(intakeGuardian.active,true),
    or(eq(householdMemberships.householdId,guardianHousehold.householdId),
     and(isNull(householdMemberships.id),isNull(guardianHousehold.id))),
    data.search?or(ilike(people.legalFirstName,"%"+data.search+"%"),
     ilike(people.legalLastName,"%"+data.search+"%"),
     ilike(intakeGuardian.legalLastName,"%"+data.search+"%"),
     z.string().uuid().safeParse(data.search).success?eq(studentProfiles.id,data.search):undefined):undefined))
   .orderBy(asc(studentProfiles.id),asc(programs.id),asc(intakeGuardian.id),asc(householdMemberships.householdId))
   .limit(data.pageSize+1).offset((data.page-1)*data.pageSize);
  const items=rows.slice(0,data.pageSize);
  return {items,nextPage:rows.length>data.pageSize?data.page+1:null};
 });
/** Legacy endpoint: return a page contract, never silently cap at 300 records. */
export const listAdmissionsExistingStudents=listAdmissionsExistingStudentsPage;
/** Totals are computed against the authorized full dataset, never a visible page. */
export const getAdmissionsStageCounts=createServerFn({method:"GET"})
 .validator((value:unknown)=>admissionsPageInput.pick({siteId:true,programId:true,search:true}).parse(value??{}))
 .handler(async({data})=>{
  const actor=await registrar();
  const rows=await db.select({stage:applications.stage,count:sql<number>`count(*)::int`})
   .from(applications)
   .innerJoin(programs,eq(programs.id,applications.programId))
   .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
   .innerJoin(people,eq(people.id,studentProfiles.personId))
   .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
    ...(actor.scope.programIds?[inArray(applications.programId,actor.scope.programIds)]:[]),
    ...(actor.scope.siteIds?[inArray(programs.siteId,actor.scope.siteIds)]:[]),
    data.siteId?eq(programs.siteId,data.siteId):undefined,
    data.programId?eq(applications.programId,data.programId):undefined,
    data.search?or(ilike(people.legalFirstName,"%"+data.search+"%"),
      ilike(people.legalLastName,"%"+data.search+"%"),
      ilike(programs.name,"%"+data.search+"%"),
      z.string().uuid().safeParse(data.search).success?eq(applications.id,data.search):undefined):undefined))
   .groupBy(applications.stage);
  return rows.map(row=>({stage:row.stage,count:Number(row.count)}));
 });

/** Scoped search for sibling reuse; no dependency on the currently visible admissions page. */
export const searchAdmissionsHouseholds=createServerFn({method:"GET"})
 .validator(z.object({programId:uuid,search:z.string().trim().min(2).max(100)}).strict())
 .handler(async({data})=>{
  const actor=await registrar();
  const [target]=await db.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!target||!actor.scope.organizationIds?.includes(target.organizationId)||
    (actor.scope.programIds&&!actor.scope.programIds.includes(data.programId))||
    (actor.scope.siteIds&&(!target.siteId||!actor.scope.siteIds.includes(target.siteId))))
    throw new AuthorizationError("admissions program");
  return db.select({id:applications.id,studentFirst:people.legalFirstName,
    studentLast:people.legalLastName,programId:applications.programId})
   .from(applications).innerJoin(programs,eq(programs.id,applications.programId))
   .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
   .innerJoin(people,eq(people.id,studentProfiles.personId))
   .where(and(eq(programs.organizationId,target.organizationId),
     ...(actor.scope.programIds?[inArray(programs.id,actor.scope.programIds)]:[]),
     ...(actor.scope.siteIds?[inArray(programs.siteId,actor.scope.siteIds)]:[]),
     or(ilike(people.legalFirstName,"%"+data.search+"%"),
        ilike(people.legalLastName,"%"+data.search+"%"),
        z.string().uuid().safeParse(data.search).success?eq(applications.id,data.search):undefined)))
   .orderBy(asc(people.legalLastName),asc(people.legalFirstName),asc(applications.id))
   .limit(40);
 });

export const listAdmissionsIntake=createServerFn({method:"GET"})
 .validator((value:unknown)=>admissionsPageInput.omit({cursor:true}).extend({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(value??{}))
 .handler(async({data})=>{
 const actor=await registrar();
 const rows=await db.select({id:applications.id,stage:applications.stage,metadata:applications.metadata,
  createdAt:applications.createdAt,updatedAt:applications.updatedAt,programId:applications.programId,
  submittedByPersonId:applications.submittedByPersonId,studentProfileId:applications.studentProfileId,
  organizationId:programs.organizationId,siteId:programs.siteId,
  studentPersonId:studentProfiles.personId,
  programName:programs.name,studentFirst:people.legalFirstName,studentLast:people.legalLastName})
  .from(applications)
  .innerJoin(programs,eq(programs.id,applications.programId))
  .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
  .innerJoin(people,eq(people.id,studentProfiles.personId))
  .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
   ...(actor.scope.programIds ? [inArray(applications.programId,actor.scope.programIds)] : []),
   ...(actor.scope.siteIds ? [inArray(programs.siteId,actor.scope.siteIds)] : []),
   data.siteId?eq(programs.siteId,data.siteId):undefined,
   data.programId?eq(applications.programId,data.programId):undefined,
   data.applicationId?eq(applications.id,data.applicationId):undefined,
   data.search?or(ilike(people.legalFirstName,"%"+data.search+"%"),ilike(people.legalLastName,"%"+data.search+"%"),ilike(programs.name,"%"+data.search+"%"),z.string().uuid().safeParse(data.search).success?eq(applications.id,data.search):undefined):undefined))
  .orderBy(desc(applications.updatedAt),desc(applications.id)).limit(data.applicationId?1:data.pageSize+1).offset(data.applicationId?0:(data.page-1)*data.pageSize);
 const hasMore=!data.applicationId&&rows.length>data.pageSize;
 rows.splice(data.pageSize);
 const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const sourceIds=[...new Set(rows.map(r=>
   typeof r.metadata.originTransferActionId==="string"?r.metadata.originTransferActionId:null
  ).filter((id):id is string=>!!id))];
 const transferOrigins=sourceIds.length?await db.select({
   id:actions.id,status:actions.status,subjectId:actions.subjectId,
   metadata:actions.metadata,
 }).from(actions).where(and(
   eq(actions.type,"guardian_enrollment_change_request"),
   inArray(actions.id,sourceIds),
 )):[];
 const contactIds=[...new Set(rows.map(r=>applicationGuardianContact(r.metadata,r.submittedByPersonId))
  .filter(id=>uuidPattern.test(id)))];
 const relations=rows.length?await db.select({
  guardianPersonId:guardianRelationships.guardianPersonId,
  studentPersonId:guardianRelationships.studentPersonId,
  metadata:guardianRelationships.metadata,
  canManageEnrollment:guardianRelationships.canManageEnrollment,
 }).from(guardianRelationships).where(
  inArray(guardianRelationships.studentPersonId,rows.map(r=>r.studentPersonId))):[];
 const grants=contactIds.length?await db.select({
  personId:accountPersonGrants.personId,organizationId:accountPersonGrants.organizationId,
  siteId:accountPersonGrants.siteId,
 }).from(accountPersonGrants).where(and(
  inArray(accountPersonGrants.personId,contactIds),eq(accountPersonGrants.role,"guardian"),
  eq(accountPersonGrants.active,true))):[];
 const items=rows.map(r=>{
  const {metadata,...rest}=r;
  const contactId=applicationGuardianContact(metadata,r.submittedByPersonId);
  const verified=relations.some(rel=>rel.guardianPersonId===contactId&&
   rel.studentPersonId===r.studentPersonId&&rel.metadata.verification==="verified"&&
   rel.canManageEnrollment);
  const loginProvisioned=verified&&grants.some(g=>g.personId===contactId&&
   g.organizationId===r.organizationId&&(!g.siteId||g.siteId===r.siteId));
  return {
   ...rest,guardianVerified:verified,guardianLoginProvisioned:loginProvisioned,
   transferOriginStatus:(()=>{
     if(typeof metadata.originTransferActionId!=="string")return null;
     const source=transferOrigins.find(item=>item.id===metadata.originTransferActionId);
     if(!source||source.subjectId!==r.studentProfileId||source.metadata.kind!=="transfer"||
       source.metadata.requestedByGuardianPersonId!==r.submittedByPersonId)
       return "requires_review" as const;
     return source.status==="resolved"&&source.metadata.exitCompletedByRegistrar===true&&
       source.metadata.exitStatus==="transferred"?"completed" as const:"pending" as const;
   })(),
   transferNamedDestination:typeof metadata.originTransferDestinationSchoolName==="string"?
     metadata.originTransferDestinationSchoolName:null,
   destinationTranscriptConsentRecorded:typeof metadata.destinationRecordsReleaseConsentId==="string",
   transferRecordsStatus:(()=>{
     if(typeof metadata.originTransferActionId!=="string")return null;
     const source=transferOrigins.find(item=>item.id===metadata.originTransferActionId);
     if(!source||source.subjectId!==r.studentProfileId||
        source.metadata.kind!=="transfer"||
        source.metadata.requestedByGuardianPersonId!==r.submittedByPersonId)
       return "requires_review" as const;
     return source.metadata.recordsHandoffStatus==="completed"?
       (source.metadata.recordsReleasedInternally===true &&
        source.metadata.destinationApplicationId===r.id &&
        source.metadata.destinationProgramId===r.programId?
         "available_in_can" as const:"released_externally" as const):
       source.metadata.recordsHandoffStatus==="pending"?"pending_release" as const:
       "not_started" as const;
   })(),
   createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),
   disposition:metadata.admissionsDisposition==="waitlisted"?"waitlisted":metadata.admissionsDisposition==="offer_ready"?"ready_for_offer":null,
  };
 });
 return {items,hasMore,nextPage:hasMore?data.page+1:null};
});
export const createAdmissionsInquiry=createServerFn({method:"POST"}).validator((v:unknown)=>applicant.parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  if(actor.scope.programIds && !actor.scope.programIds.includes(data.programId))throw new AuthorizationError("admissions program");
  const [program]=await db.select({organizationId:programs.organizationId,siteId:programs.siteId}).from(programs)
   .where(eq(programs.id,data.programId)).limit(1);
  if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
   (actor.scope.siteIds!==undefined&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))throw new AuthorizationError("admissions school and organization");
  return db.transaction(async tx=>{
   let existingStudent:typeof studentProfiles.$inferSelect|undefined;
   let existingChoice:Awaited<ReturnType<typeof existingStudentChoices>>[number]|undefined;
   let synthetic=false;
   if(data.existingStudent){
    const [choice]=await existingStudentChoices(tx,actor,data.programId,data.existingStudent);
    if(!choice)throw new AuthorizationError("existing student, guardian and household scope");
    [existingStudent]=await tx.select().from(studentProfiles)
     .where(eq(studentProfiles.id,choice.studentProfileId)).for("update").limit(1);
    if(!existingStudent)throw new AuthorizationError("existing student");
    if(data.existingStudent.createHousehold)await tx.select({id:people.id}).from(people)
     .where(eq(people.id,data.existingStudent.guardianPersonId)).for("update").limit(1);
    [existingChoice]=await existingStudentChoices(tx,actor,data.programId,data.existingStudent);
    if(!existingChoice)
     throw new AuthorizationError("existing student, guardian and household scope");
    const [person]=await tx.select({metadata:people.metadata}).from(people)
     .where(eq(people.id,existingStudent.personId)).limit(1);
    if(!person)throw new AuthorizationError("existing student identity");
    assertRecordWriteAllowed(existingStudent.metadata,"registrar");
    assertRecordWriteAllowed(person.metadata,"registrar");
    synthetic=existingStudent.metadata.synthetic===true||person.metadata.synthetic===true;
   }
   const idempotencyKey="registrar-inquiry:"+data.requestId;
   const [repeat]=await tx.select({id:applications.id,programId:applications.programId,
    studentProfileId:applications.studentProfileId,householdId:applications.householdId,metadata:applications.metadata})
    .from(applications).where(eq(applications.idempotencyKey,idempotencyKey)).limit(1);
   if(repeat){
    if(repeat.programId!==data.programId)throw new Error("Inquiry request key reused for another program");
    if(data.existingStudent&&(repeat.studentProfileId!==data.existingStudent.studentProfileId||
      (data.existingStudent.householdId&&repeat.householdId!==data.existingStudent.householdId)||
      (data.existingStudent.createHousehold&&repeat.metadata.createdHousehold!==true)||
      repeat.metadata.contactPersonId!==data.existingStudent.guardianPersonId))
     throw new Error("Inquiry request key reused for another student or household");
    if(!data.existingStudent&&repeat.metadata.existingStudent===true)
     throw new Error("Inquiry request key reused for a different intake mode");
    if((repeat.metadata.publicInterestId??null)!==(data.publicInterestId??null))
     throw new Error("Inquiry request key reused with a different public interest");
    return {applicationId:repeat.id};
   }
   // A selected web interest is untrusted contact data, not a Student,
   // Household or verified guardian. Lock it before creating those records,
   // so concurrent registrar attempts cannot create duplicate conversions.
   let interestToConvert: { id: string; priorStatus: string; source: string } | null = null;
   if (data.publicInterestId) {
    if (!program.siteId || data.existingStudent || data.existingApplicationId)
     throw new Error("Public interest conversion requires a newly reviewed student intake");
    // Keep Site/Organization ownership stable for the duration of the
    // conversion, even if another administrator is moving the Program.
    const [boundProgram] = await tx.select({
      organizationId:programs.organizationId,siteId:programs.siteId,
    }).from(programs).where(eq(programs.id,data.programId))
      .for("share").limit(1);
    if (!boundProgram || !boundProgram.siteId || boundProgram.organizationId!==program.organizationId ||
      boundProgram.siteId!==program.siteId ||
      !actor.scope.organizationIds?.includes(boundProgram.organizationId) ||
      (actor.scope.siteIds !== undefined && !actor.scope.siteIds.includes(boundProgram.siteId)))
     throw new AuthorizationError("public interest Program ownership changed");
    // An inquiry may be recorded pre-opening, but converting it into a
    // canonical Application/Student/Household requires current CAN academic
    // admissions and school-of-record authorization.
    const authorizedDestination = await resolvePrivateFamilyStartDestination(tx, data.programId);
    if (authorizedDestination.siteId !== boundProgram.siteId ||
        authorizedDestination.organizationId !== boundProgram.organizationId)
      throw new AuthorizationError("authorized family admission destination");
    const [interest] = await tx.select({
      id:publicAdmissionsInterests.id,
      status:publicAdmissionsInterests.status,
      source:publicAdmissionsInterests.source,
      applicationId:publicAdmissionsInterests.applicationId,
      siteId:publicAdmissionsInterests.siteId,
      programId:publicAdmissionsInterests.programId,
      firstName:publicAdmissionsInterests.contactFirstName,
      lastName:publicAdmissionsInterests.contactLastName,
      email:publicAdmissionsInterests.contactEmail,
    }).from(publicAdmissionsInterests).where(and(
      eq(publicAdmissionsInterests.id,data.publicInterestId),
      eq(publicAdmissionsInterests.programId,data.programId),
      eq(publicAdmissionsInterests.siteId,program.siteId),
    )).for("update").limit(1);
    if (!interest) throw new AuthorizationError("public interest intake scope");
    assertPublicInterestConversion({
      interest,
      request:{
        programId:data.programId,siteId:program.siteId,
        guardianFirstName:data.guardianFirstName,
        guardianLastName:data.guardianLastName,
        guardianEmail:data.guardianEmail,
        contactReviewed:data.contactReviewed===true,
        hasExistingStudent:false,
        hasExistingApplication:false,
      },
    });
    // Do not create another unverified Person/Household when this school
    // already has an application for this adult contact. A sibling must use
    // the explicit existing-household path and its relationship checks.
    const [priorHousehold] = await tx.select({ id:households.id }).from(households)
      .innerJoin(applications,eq(applications.householdId,households.id))
      .innerJoin(programs,eq(programs.id,applications.programId))
      .where(and(
        eq(programs.organizationId,program.organizationId),
        ...(actor.scope.programIds ? [inArray(programs.id,actor.scope.programIds)] : []),
        ...(actor.scope.siteIds ? [inArray(programs.siteId,actor.scope.siteIds)] : []),
        sql`lower(trim(${households.primaryEmail})) = ${normalizeAccessEmail(data.guardianEmail)}`,
      )).limit(1);
    if(priorHousehold)throw new Error(
      "An existing school household uses this contact email. Use verified existing-household intake."
    );
    interestToConvert = { id:interest.id, priorStatus:interest.status, source:interest.source };
   }
   let guardianPersonId:string;
   let householdId:string;
   let studentProfileId:string;
   if(data.existingStudent&&existingStudent&&existingChoice){
    const [open]=await tx.select({id:applications.id}).from(applications).where(and(
     eq(applications.studentProfileId,existingStudent.id),eq(applications.programId,data.programId),
     inArray(applications.stage,["inquiry","application","eligibility","accepted"]))).limit(1);
    if(open)throw new Error("This student already has an open application for this program. Continue that application.");
    guardianPersonId=data.existingStudent.guardianPersonId;
    studentProfileId=existingStudent.id;
    if(data.existingStudent.householdId){
     householdId=data.existingStudent.householdId;
    } else {
     if(existingChoice.householdId)throw new Error("This student already has a household. Select the existing household.");
     const [household]=await tx.insert(households).values({
      displayName:existingChoice.guardianLastName+" Household",
     }).returning({id:households.id});
     householdId=household!.id;
     await tx.insert(householdMemberships).values([
      {householdId,personId:existingStudent.personId,relationshipLabel:"student"},
      {householdId,personId:guardianPersonId,relationshipLabel:"guardian",isPrimaryContact:true},
     ]);
    }
   } else if(!data.existingStudent){
    if(data.existingApplicationId){
     const [prior]=await tx.select({householdId:applications.householdId,
      metadata:applications.metadata,programId:applications.programId,
      organizationId:programs.organizationId,siteId:programs.siteId})
      .from(applications).innerJoin(programs,eq(programs.id,applications.programId))
      .where(eq(applications.id,data.existingApplicationId)).limit(1);
     if(!prior||
      (actor.scope.programIds !== undefined && !actor.scope.programIds.includes(prior.programId))||
      prior.organizationId!==program.organizationId||
      (actor.scope.siteIds!==undefined&&(!prior.siteId||!actor.scope.siteIds.includes(prior.siteId))))
      throw new AuthorizationError("existing family scope");
     const contactId=String(prior.metadata.contactPersonId??"");
     const [contact]=await tx.select({id:people.id,email:people.email})
      .from(people).where(eq(people.id,contactId)).limit(1);
     if(!contact?.email||normalizeAccessEmail(contact.email)!==normalizeAccessEmail(data.guardianEmail))
      throw new Error("Guardian email must match the verified household contact");
     householdId=prior.householdId;
     guardianPersonId=contact.id;
    } else {
     // Intake creates an unverified prospective contact. No account grant is
     // created until a registrar explicitly provisions guardian access.
     const [guardian]=await tx.insert(people).values({
      legalFirstName:data.guardianFirstName,legalLastName:data.guardianLastName,email:data.guardianEmail,
      metadata:{synthetic:false,origin:"registrar_intake"},
     }).returning({id:people.id});
     const [household]=await tx.insert(households).values({
      displayName:data.guardianLastName+" Household",primaryEmail:data.guardianEmail,
     }).returning({id:households.id});
     guardianPersonId=guardian!.id;householdId=household!.id;
     await tx.insert(householdMemberships).values({
      householdId,personId:guardianPersonId,relationshipLabel:"guardian",isPrimaryContact:true,
     });
    }
    const [studentPerson]=await tx.insert(people).values({
     legalFirstName:data.studentFirstName,legalLastName:data.studentLastName,
     metadata:{synthetic:false,origin:"registrar_intake"},
    }).returning({id:people.id});
    const [student]=await tx.insert(studentProfiles).values({
     personId:studentPerson!.id,gradeLevel:data.gradeLevel||null,metadata:{synthetic:false,origin:"registrar_intake"},
    }).returning({id:studentProfiles.id});
    await tx.insert(householdMemberships).values({
     householdId,personId:studentPerson!.id,relationshipLabel:"student",
    });
    await tx.insert(guardianRelationships).values({
     guardianPersonId,studentPersonId:studentPerson!.id,relationshipLabel:"guardian",
     canViewAcademics:false,canManageEnrollment:false,canSubmitAttendanceExcuse:false,
     metadata:{verification:"pending",source:"registrar_intake"},
    });
    studentProfileId=student!.id;
   } else {
    throw new AuthorizationError("existing student");
   }
   const [application]=await tx.insert(applications).values({
    householdId,studentProfileId,programId:data.programId,
    submittedByPersonId:actor.actorPersonId!,stage:"inquiry",
    idempotencyKey,
    metadata:{synthetic,source:interestToConvert?interestToConvert.source:data.source,
     notes:data.notes??"",origin:"registrar_intake",contactPersonId:guardianPersonId,
     ...(interestToConvert?{publicInterestId:interestToConvert.id,contactReviewedByRegistrar:true}:{}),
     ...(data.existingStudent?{existingStudent:true,createdHousehold:data.existingStudent.createHousehold===true}:{})},
   }).returning({id:applications.id});
   if (interestToConvert) {
    const now = new Date();
    const [linked] = await tx.update(publicAdmissionsInterests).set({
      applicationId:application!.id,
      status:"converted",convertedAt:now,convertedByPersonId:actor.actorPersonId!,
      updatedAt:now,
    }).where(and(
      eq(publicAdmissionsInterests.id,interestToConvert.id),
      inArray(publicAdmissionsInterests.status,["new","contacted"]),
      isNull(publicAdmissionsInterests.applicationId),
    )).returning({id:publicAdmissionsInterests.id});
    if (!linked) throw new Error("Public interest was already converted; refresh admissions");
    await writeAudit(tx,actor,{
      action:"admissions.public_interest.convert",
      entityType:"public_admissions_interest",entityId:interestToConvert.id,
      scope:{organizationId:program.organizationId,siteId:program.siteId,programId:data.programId},
      before:{status:interestToConvert.priorStatus},
      after:{status:"converted",applicationId:application!.id,
        contactReviewConfirmed:true,guardianRelationshipVerification:"pending"},
    });
    await emitEvent(tx,{
      eventType:EventTypes.PublicAdmissionsInterestConverted,
      aggregateType:"public_admissions_interest",aggregateId:interestToConvert.id,
      actorPersonId:actor.actorPersonId,
      organizationId:program.organizationId,siteId:program.siteId,programId:data.programId,
      payload:{applicationId:application!.id,status:"converted"},
    });
   }
   await emitEvent(tx,{eventType:EventTypes.AdmissionsInquiryCreated,aggregateType:"application",
    aggregateId:application!.id,actorPersonId:actor.actorPersonId,
    payload:{programId:data.programId,studentProfileId,existingStudent:!!data.existingStudent,
     createdHousehold:data.existingStudent?.createHousehold===true}});
   await writeAudit(tx,actor,{
    action:"admissions.inquiry.create",entityType:"application",entityId:application!.id,
    scope:{organizationId:program.organizationId,programId:data.programId},
    after:{stage:"inquiry",source:data.source,studentProfileId,householdId,guardianPersonId,
     existingStudent:!!data.existingStudent,createdHousehold:data.existingStudent?.createHousehold===true}});
   return {applicationId:application!.id};
  });
 });
export const transitionAdmissionsStage=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({applicationId:uuid,
  decision:z.enum(["application","eligibility","accept","decline","withdraw","waitlist","restore"]),
  note:z.string().trim().max(2000).optional()}).strict().parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  return db.transaction(async tx=>{
   await lockAdmissionsApplication(tx,data.applicationId);
   const [app]=await tx.select().from(applications).where(eq(applications.id,data.applicationId))
    .for("update").limit(1);
   if(!app||(actor.scope.programIds !== undefined && !actor.scope.programIds.includes(app.programId)))
    throw new AuthorizationError("admissions application");
   assertRecordWriteAllowed(app.metadata,"registrar");
   const [scope]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,app.programId)).limit(1);
   if(!scope||!actor.scope.organizationIds?.includes(scope.organizationId)||
    (actor.scope.siteIds!==undefined&&(!scope.siteId||!actor.scope.siteIds.includes(scope.siteId))))throw new AuthorizationError("admissions school and organization");
   const waitlisted=app.metadata.admissionsDisposition==="waitlisted";
   const expected:Record<string,string[]>={
    application:["inquiry"],eligibility:["application"],accept:["eligibility"],
    decline:["inquiry","application","eligibility"],withdraw:["inquiry","application","eligibility"],
    waitlist:["eligibility"],restore:["eligibility"],
   };
   if(!expected[data.decision]?.includes(app.stage) ||
      ((data.decision==="restore")!==waitlisted && ["restore"].includes(data.decision)) ||
      (waitlisted&&!["restore","decline","withdraw"].includes(data.decision)))
    throw new Error("Decision is not permitted from the current admissions stage");
   if(["decline","withdraw","waitlist"].includes(data.decision)){
    const offers=await tx.select({status:admissionOffers.status,expiresAt:admissionOffers.expiresAt}).from(admissionOffers)
     .where(eq(admissionOffers.applicationId,app.id));
    if(offers.some(offer=>offer.status==="accepted"))
     throw new Error("This application has an accepted offer. Resolve its enrollment through the enrollment workflow; intake cannot close or waitlist it.");
    if(offers.some(offer=>offerHoldsSeat(offer)))
     throw new Error("Withdraw each unaccepted enrollment offer before closing or waitlisting this application.");
    const [activeEnrollment]=await tx.select({id:enrollments.id}).from(enrollments)
     .where(and(eq(enrollments.studentProfileId,app.studentProfileId),eq(enrollments.programId,app.programId),
      eq(enrollments.kind,"program"),eq(enrollments.status,"active"))).limit(1);
    if(activeEnrollment)throw new Error("Active enrollment cannot be closed or waitlisted from admissions intake.");
   }
   const next=data.decision==="application"?"application":data.decision==="eligibility"?"eligibility":
    data.decision==="accept"?app.stage:data.decision==="decline"?"declined":
    data.decision==="withdraw"?"withdrawn":app.stage;
   let nextMetadata:Record<string,unknown>={...app.metadata};
   if(data.decision==="waitlist")nextMetadata={...nextMetadata,admissionsDisposition:"waitlisted"};
   if(data.decision==="accept")nextMetadata={...nextMetadata,admissionsDisposition:"offer_ready"};
   if(data.decision==="restore")nextMetadata={...nextMetadata,admissionsDisposition:null};
   if(["decline","withdraw"].includes(data.decision))nextMetadata={...nextMetadata,admissionsDisposition:null};
   if(data.decision==="eligibility" || data.decision==="accept"){
    const [journey]=await tx.select({id:journeys.id}).from(journeys)
     .where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,app.id))).limit(1);
    if(data.decision==="eligibility" && !journey){
     const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId,metadata:programs.metadata})
      .from(programs).where(eq(programs.id,app.programId)).for("share").limit(1);
     if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
       (actor.scope.siteIds!==undefined&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))throw new AuthorizationError("enrollment school and organization");
     await instantiateJourneyFromDefinition(tx,{definitionKey:enrollmentJourneyDefinitionKey(program.metadata),
      subjectType:"application",subjectId:app.id,programId:app.programId,ownerPersonId:actor.actorPersonId,
      organizationId:program.organizationId,siteId:program.siteId,
      insertErrorLabel:"Family enrollment"});
    }
    if(data.decision==="accept"){
     // Offer-ready is an academic institution admissions decision, not
     // permission inferred from a host-owned school Site.
     await requireChurchHostedOperatingServices(tx,app.programId,[
      "admissions","school_of_record",
     ]);
     if(!journey)throw new Error("Application has no enrollment journey");
     const blockers=await tx.select({id:journeyRequirements.id}).from(journeyRequirements)
      .where(and(eq(journeyRequirements.journeyId,journey.id),eq(journeyRequirements.blocking,true)));
     const statuses=blockers.length?await tx.select({id:journeyRequirements.id,status:journeyRequirements.status})
      .from(journeyRequirements).where(inArray(journeyRequirements.id,blockers.map(b=>b.id))):[];
     if(statuses.some(s=>s.status!=="complete"))throw new Error("Complete blocking enrollment requirements before acceptance");
    }
   }
   await tx.update(applications).set({stage:next,metadata:nextMetadata,
    decidedAt:["decline","withdraw"].includes(data.decision)?new Date():app.decidedAt,
    decisionNote:data.note||app.decisionNote,updatedAt:new Date()}).where(eq(applications.id,app.id));
   await emitEvent(tx,{eventType:EventTypes.AdmissionsStageChanged,aggregateType:"application",
    aggregateId:app.id,actorPersonId:actor.actorPersonId,
    payload:{programId:app.programId,from:app.stage,to:next,decision:data.decision}});
   await writeAudit(tx,actor,{
    action:"admissions.stage."+data.decision,entityType:"application",entityId:app.id,
    scope:{programId:app.programId},before:{stage:app.stage,disposition:app.metadata.admissionsDisposition??null},
    after:{stage:next,disposition:nextMetadata.admissionsDisposition??null},contextExtras:{note:data.note??null}});
   return {stage:next};
  });
 });

/**
 * Connect the prospective guardian's existing Person to a real passwordless
 * login. Do not grant an existing account to a different Person just because
 * an operator typed that email; such cases need verified identity resolution.
 */
export const provisionInquiryGuardianAccount=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({applicationId:uuid}).parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [app]=await tx.select({
    id:applications.id,programId:applications.programId,studentProfileId:applications.studentProfileId,metadata:applications.metadata,
    submittedByPersonId:applications.submittedByPersonId,
   }).from(applications).where(eq(applications.id,data.applicationId)).limit(1);
   if(!app||(actor.scope.programIds!==undefined&&!actor.scope.programIds.includes(app.programId)))
    throw new AuthorizationError("admissions guardian provisioning");
   const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,app.programId)).limit(1);
   if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
    (actor.scope.siteIds!==undefined&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))
    throw new AuthorizationError("guardian membership scope");
   assertRecordWriteAllowed(app.metadata,"registrar");
   const contactId=applicationGuardianContact(app.metadata,app.submittedByPersonId);
   const [contact]=await tx.select({id:people.id,email:people.email})
    .from(people).where(eq(people.id,contactId)).limit(1);
   if(!contact?.email)throw new Error("Guardian contact email missing");
   const [learner]=await tx.select({personId:studentProfiles.personId})
    .from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
   const [relationship]=learner?await tx.select({
    metadata:guardianRelationships.metadata,
    canManageEnrollment:guardianRelationships.canManageEnrollment,
   }).from(guardianRelationships).where(and(
    eq(guardianRelationships.guardianPersonId,contact.id),
    eq(guardianRelationships.studentPersonId,learner.personId),
   )).limit(1):[];
   // An email entered during intake is not proof of guardianship. Never
   // activate passwordless access before an authorized relationship check.
   if(!relationship||relationship.metadata.verification!=="verified"||
      !relationship.canManageEnrollment)
    throw new Error("Verify the student's guardian relationship before granting account access");
   const email=normalizeAccessEmail(contact.email);
   let [account]=await tx.select({id:accessAccounts.id,disabled:accessAccounts.disabled})
    .from(accessAccounts).where(eq(accessAccounts.emailNormalized,email)).limit(1);
   if(account?.disabled)throw new Error("Guardian account is disabled");
   if(account){
    const existing=await tx.select({personId:accountPersonGrants.personId})
     .from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id));
    if(existing.some(g=>g.personId!==contact.id))
     throw new Error("Account email belongs to another identity; verify and reconcile before granting access");
   } else {
    [account]=await tx.insert(accessAccounts).values({emailNormalized:email})
     .returning({id:accessAccounts.id,disabled:accessAccounts.disabled});
   }
   const [grant]=await tx.select({id:accountPersonGrants.id,active:accountPersonGrants.active})
    .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,account!.id),
     eq(accountPersonGrants.personId,contact.id),eq(accountPersonGrants.role,"guardian"),
     eq(accountPersonGrants.organizationId,program.organizationId),
     program.siteId?eq(accountPersonGrants.siteId,program.siteId):isNull(accountPersonGrants.siteId)))
    .limit(1);
   if(grant){
    if(!grant.active)throw new Error("A revoked guardian grant requires a separate reauthorization");
    return {created:false,email,accountId:account!.id};
   }
   const [newGrant]=await tx.insert(accountPersonGrants).values({
    accountId:account!.id,personId:contact.id,role:"guardian",
    organizationId:program.organizationId,siteId:program.siteId,
    isSynthetic:app.metadata.synthetic===true,
   }).returning({id:accountPersonGrants.id});
   await writeAudit(tx,actor,{
    action:"admissions.guardian_access.provision",entityType:"account_person_grant",
    entityId:newGrant!.id,scope:{organizationId:program.organizationId,
     programId:app.programId,siteId:program.siteId},
    after:{personId:contact.id,role:"guardian",applicationId:app.id}});
   return {created:true,email,accountId:account!.id};
  });
 });

/** Issue a short-lived, single-use verified-email sign-in link to the linked
 * household contact. The underlying access service enforces cooldowns and
 * never creates a session without a real active membership. */
export const sendAdmissionsGuardianInvitation=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({applicationId:uuid}).parse(value))
 .handler(async({data})=>{
  const actor=await registrar();
  const [application]=await db.select({programId:applications.programId,
   studentProfileId:applications.studentProfileId,
   organizationId:programs.organizationId,siteId:programs.siteId,
   metadata:applications.metadata,submittedByPersonId:applications.submittedByPersonId}).from(applications)
   .innerJoin(programs,eq(programs.id,applications.programId))
   .where(eq(applications.id,data.applicationId)).limit(1);
  if(!application||(actor.scope.programIds!==undefined&&!actor.scope.programIds.includes(application.programId))||
    !actor.scope.organizationIds?.includes(application.organizationId)||
    (actor.scope.siteIds!==undefined&&(!application.siteId||!actor.scope.siteIds.includes(application.siteId))))
   throw new AuthorizationError("admissions invitation Program, school and site scope");
  const contactId=applicationGuardianContact(application.metadata,application.submittedByPersonId);
  const [contact]=await db.select({email:people.email})
   .from(people).where(eq(people.id,contactId)).limit(1);
  if(!contact?.email)throw new Error("Guardian email is missing");
  const [learner]=await db.select({personId:studentProfiles.personId})
   .from(studentProfiles).where(eq(studentProfiles.id,application.studentProfileId)).limit(1);
  const [verified]=learner?await db.select({
   metadata:guardianRelationships.metadata,
   canManageEnrollment:guardianRelationships.canManageEnrollment,
  }).from(guardianRelationships).where(and(
   eq(guardianRelationships.guardianPersonId,contactId),
   eq(guardianRelationships.studentPersonId,learner.personId),
  )).limit(1):[];
  if(!verified||verified.metadata.verification!=="verified"||!verified.canManageEnrollment)
   throw new Error("Guardian relationship verification is required before inviting");
  const [grant]=await db.select({id:accountPersonGrants.id})
   .from(accountPersonGrants)
   .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
   .where(and(eq(accountPersonGrants.personId,contactId),
    eq(accountPersonGrants.role,"guardian"),eq(accountPersonGrants.active,true),
    eq(accountPersonGrants.organizationId,application.organizationId),
    ...(application.siteId?[or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,application.siteId))]:[isNull(accountPersonGrants.siteId)]),
    eq(accessAccounts.emailNormalized,normalizeAccessEmail(contact.email)))).limit(1);
  if(!grant)throw new Error("Provision the guardian's identity-bound access first");
  const {requestOneTimeAccess}=await import("@/modules/identity/passwordless-access.server");
  await requestOneTimeAccess(contact.email);
  await writeAudit(db,actor,{
   action:"admissions.guardian.invite",entityType:"application",
   entityId:data.applicationId,scope:{programId:application.programId},
   after:{invitationRequested:true}});
  return {sent:true};
 });

/** Guardian permissions are not automatically created from a registrar-entered
 * email. Staff must attest to an independent relationship check first. */
export const verifyAdmissionsGuardianRelationship=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
  applicationId:uuid,
  method:z.enum(["in_person_id","verified_school_record","live_video_verification"]),
  evidenceNote:z.string().trim().min(12).max(2000),
 }).parse(value))
 .handler(async({data})=>{
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [app]=await tx.select({
    id:applications.id,programId:applications.programId,
    studentProfileId:applications.studentProfileId,metadata:applications.metadata,
    submittedByPersonId:applications.submittedByPersonId,
    organizationId:programs.organizationId,siteId:programs.siteId,
   }).from(applications).innerJoin(programs,eq(programs.id,applications.programId))
     .where(eq(applications.id,data.applicationId)).limit(1);
   if(!app||(actor.scope.programIds!==undefined&&!actor.scope.programIds.includes(app.programId))||
      !actor.scope.organizationIds?.includes(app.organizationId)||
      (actor.scope.siteIds!==undefined&&(!app.siteId||!actor.scope.siteIds.includes(app.siteId))))
    throw new AuthorizationError("guardian relationship verification Program, school and site scope");
   assertRecordWriteAllowed(app.metadata,"registrar");
   const contactId=applicationGuardianContact(app.metadata,app.submittedByPersonId);
   const [learner]=await tx.select({personId:studentProfiles.personId})
    .from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
   if(!learner)throw new Error("Student not found");
   const [relationship]=await tx.select().from(guardianRelationships)
    .where(and(eq(guardianRelationships.guardianPersonId,contactId),
     eq(guardianRelationships.studentPersonId,learner.personId))).for("update").limit(1);
   if(!relationship)throw new Error("Guardian relationship not found");
   if(relationship.metadata.verification==="verified")return {verified:true};
   const verifiedAt=new Date();
   await tx.update(guardianRelationships).set({
    canViewAcademics:true,canManageEnrollment:true,canSubmitAttendanceExcuse:true,
    canManagePickup:true,
    metadata:{...relationship.metadata,verification:"verified",
     method:data.method,evidenceNote:data.evidenceNote,
     verifiedBy:actor.actorPersonId,verifiedAt:verifiedAt.toISOString()},
    updatedAt:verifiedAt,
   }).where(eq(guardianRelationships.id,relationship.id));
   await writeAudit(tx,actor,{
    action:"admissions.guardian_relationship.verify",
    entityType:"guardian_relationship",entityId:relationship.id,
    scope:{programId:app.programId},
    before:{verification:relationship.metadata.verification??"unverified"},
    after:{verification:"verified",method:data.method,
     studentProfileId:app.studentProfileId},
    contextExtras:{evidenceNote:data.evidenceNote},
   });
   return {verified:true};
  });
 });
