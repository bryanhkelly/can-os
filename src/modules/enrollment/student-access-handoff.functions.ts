import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
 accessAccounts, accountPersonGrants, applications, enrollments,
 guardianRelationships, people, programs, sections, studentAccessConsents,
 studentProfiles, terms,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { familyApplicationSchoolYearId } from "@/domain/family-application-handoff";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { staffedPublishedSectionIds } from "./instructional-section-readiness.server";
import { requestOneTimeAccess } from "@/modules/identity/passwordless-access.server";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
const uuid=z.string().uuid();
const consentInput=z.object({
 applicationId:uuid,studentEmail:z.string().trim().email().max(254),
 acknowledged:z.literal(true),
}).strict();
const idInput=z.object({applicationId:uuid}).strict();
const studentAccessReviewInput=idInput.extend({
 confirmedIndependentIdentity:z.literal(true).optional(),
 reviewMethod:z.enum(["institutional_school_record","verified_in_person"]).optional(),
}).strict();
const statement="I am this student's independently verified parent or legal guardian. I authorize CAN OS to send this student a separate school learning sign-in link to the email I provided. This does not grant my account student access.";

type HandoffReader=typeof db|Parameters<Parameters<typeof db.transaction>[0]>[0];
async function readHandoffApplication(tx:HandoffReader,applicationId:string){
 const [app]=await tx.select({
  id:applications.id,programId:applications.programId,
  studentProfileId:applications.studentProfileId,stage:applications.stage,
  applicationMetadata:applications.metadata,programStatus:programs.status,
  studentPersonId:studentProfiles.personId,
  siteId:programs.siteId,organizationId:programs.organizationId,
 }).from(applications)
  .innerJoin(programs,eq(programs.id,applications.programId))
  .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
  .where(eq(applications.id,applicationId)).limit(1);
 if(!app?.siteId)
  throw new AuthorizationError("accepted school application and active school Program/Site");
 return app;
}
type HandoffApplication=Awaited<ReturnType<typeof readHandoffApplication>>;
class StudentLearningBlocker extends AuthorizationError {
 constructor(readonly code:"application_not_accepted"|"program_inactive"|"enrollment_missing"|"placement_missing"|"classroom_not_ready",
  readonly messageForFamily:string,readonly nextAction:string,readonly target:"application"|"academic_setup",denial:string){
  super(denial);
 }
}
async function requireEligibleStudent(tx:HandoffReader,app:HandoffApplication){
 if(!app.siteId)throw new AuthorizationError("student application school Site");
 if(app.stage!=="accepted")throw new StudentLearningBlocker("application_not_accepted",
  "The application is not currently accepted.","Review the admissions decision","application","accepted school application required");
 if(app.programStatus!=="active")throw new StudentLearningBlocker("program_inactive",
  "The school Program is not active. Student access cannot be prepared yet.","Review the school's current operating status","academic_setup","active school Program/Site required");
 const intendedYear=familyApplicationSchoolYearId(app.applicationMetadata);
 const active=await tx.select({schoolYearId:enrollments.schoolYearId})
  .from(enrollments).where(and(
   eq(enrollments.studentProfileId,app.studentProfileId),
   eq(enrollments.programId,app.programId),
   eq(enrollments.kind,"program"),eq(enrollments.status,"active"),
   ...(intendedYear?[eq(enrollments.schoolYearId,intendedYear)]:[]),
  ));
 if(!active.length)throw new StudentLearningBlocker("enrollment_missing",
  "Active enrollment is missing for this application's school year.","Complete enrollment for the intended school year","application","active accepted student enrollment");
 const sectionRows=await tx.select({
  id:sections.id,
  sectionProgramId:sections.programId,sectionSiteId:sections.siteId,
  sectionYearId:terms.schoolYearId,
  enrollmentYearId:enrollments.schoolYearId,
 })
  .from(enrollments)
  .innerJoin(sections,eq(sections.id,enrollments.sectionId))
  .innerJoin(terms,eq(terms.id,sections.termId))
  .where(and(
   eq(enrollments.studentProfileId,app.studentProfileId),
   eq(enrollments.programId,app.programId),
   eq(enrollments.schoolYearId,terms.schoolYearId),
   eq(sections.programId,app.programId),
   eq(sections.siteId,app.siteId),
   eq(enrollments.kind,"section"),eq(enrollments.status,"active"),
   eq(sections.active,true),
  ));
 // Both enrollment records must refer to the SAME Section's Program,
 // same published host Site, and same school year. A stale or mis-keyed
 // Section membership must not provision a fresh student's login.
 const validIds=sectionRows.filter(row=>
  row.sectionProgramId===app.programId &&
  row.sectionSiteId===app.siteId &&
  row.enrollmentYearId===row.sectionYearId &&
  (!intendedYear||row.sectionYearId===intendedYear) &&
  active.some(a=>a.schoolYearId===row.sectionYearId))
  .map(row=>row.id);
 if(!validIds.length)throw new StudentLearningBlocker("placement_missing",
  "The student has no active class placement in the application's Program and school year.","Assign the student to a ready class","application","actual ready classroom placement");
 const ready=await staffedPublishedSectionIds(validIds,tx);
 if(!ready.size)throw new StudentLearningBlocker("classroom_not_ready",
  "The assigned class does not currently meet instructional readiness requirements.","Review the class's curriculum, teacher and academic authority","academic_setup","actual ready classroom placement");
 return app;
}
async function eligibleStudent(tx:HandoffReader,applicationId:string){
 return requireEligibleStudent(tx,await readHandoffApplication(tx,applicationId));
}

export const consentToStudentLearningAccount=createServerFn({method:"POST"})
 .validator((v:unknown)=>consentInput.parse(v))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  if(actor.role!=="guardian"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("real verified guardian");
  assertCapability(actor,"enrollment.apply");
  const studentEmail=normalizeAccessEmail(data.studentEmail);
  // The real passwordless issuer deliberately never sends to .invalid.
  // Refuse an undeliverable testing address BEFORE recording guardian consent,
  // instead of approving an enrollment handoff whose link cannot be sent.
  if(studentEmail.endsWith(".invalid")||studentEmail.endsWith(".demo"))
   throw new Error("Provide a deliverable student email to receive the learning sign-in link");
  await db.transaction(async tx=>{
   const app=await eligibleStudent(tx,data.applicationId);
   if(!actor.scope.programIds?.includes(app.programId)||
      !actor.scope.siteIds?.includes(app.siteId!)||
      !actor.scope.organizationIds?.includes(app.organizationId))
    throw new AuthorizationError("original verified family school scope");
   const [guardian]=await tx.select({id:guardianRelationships.id})
    .from(guardianRelationships).where(and(
      eq(guardianRelationships.studentPersonId,app.studentPersonId),
      eq(guardianRelationships.guardianPersonId,actor.actorPersonId!),
      eq(guardianRelationships.canManageEnrollment,true),
    )).limit(1);
   if(!guardian)throw new AuthorizationError("current guardian authorization");
   const [verified]=await tx.select({metadata:guardianRelationships.metadata})
     .from(guardianRelationships).where(eq(guardianRelationships.id,guardian.id)).limit(1);
   if(verified?.metadata.verification!=="verified")throw new AuthorizationError("independently verified guardian relationship");
   const [adultAccount]=await tx.select({email:accessAccounts.emailNormalized,
     verified:accessAccounts.emailVerifiedAt}).from(accessAccounts)
     .where(eq(accessAccounts.id,actor.accountId)).limit(1);
   if(!adultAccount?.verified||adultAccount.email===studentEmail)
    throw new AuthorizationError("separate verified adult and student email addresses");
   const [person]=await tx.select({email:people.email}).from(people)
    .where(eq(people.id,app.studentPersonId)).limit(1);
   if(person?.email && normalizeAccessEmail(person.email)!==studentEmail)
    throw new Error("Student contact differs from the school identity record; resolve through admissions");
   const [existing]=await tx.select().from(studentAccessConsents)
     .where(eq(studentAccessConsents.applicationId,app.id)).for("update").limit(1);
   if(existing && existing.status!=="pending_review")
    throw new Error("Student access has already been reviewed. Contact admissions for changes.");
   if(existing && existing.guardianPersonId!==actor.actorPersonId)
    throw new Error("An existing guardian consent must be resolved by admissions");
   const payload={studentEmail,consentStatement:statement,signedAt:new Date(),
     status:"pending_review" as const};
   if(existing)await tx.update(studentAccessConsents).set({...payload,updatedAt:new Date()})
     .where(eq(studentAccessConsents.id,existing.id));
   else await tx.insert(studentAccessConsents).values({
    applicationId:app.id,studentProfileId:app.studentProfileId,
    guardianPersonId:actor.actorPersonId!,programId:app.programId,
    siteId:app.siteId!,...payload,
   });
   await writeAudit(tx,{actorPersonId:actor.actorPersonId,action:"student.access.guardian_consent",
    resourceType:"application",resourceId:app.id,
    scope:{organizationId:app.organizationId,programId:app.programId,siteId:app.siteId},
    after:{studentPersonId:app.studentPersonId,status:"pending_review"},
    context:{accountId:actor.accountId,sessionId:actor.sessionId}});
  });
  return {status:"pending_review" as const};
 });

export const getStudentLearningHandoff=createServerFn({method:"GET"})
 .validator((v:unknown)=>idInput.parse(v))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  if(!actor.actorPersonId || !["guardian","registrar"].includes(actor.role))
   throw new AuthorizationError("authorized student access handoff");
  const app=await readHandoffApplication(db,data.applicationId);
  if(!actor.scope.programIds?.includes(app.programId)||
     !actor.scope.siteIds?.includes(app.siteId!)||
     !actor.scope.organizationIds?.includes(app.organizationId))
   throw new AuthorizationError("school membership");
  if(actor.role==="guardian"){
   const [relation]=await db.select({canManage:guardianRelationships.canManageEnrollment,
      metadata:guardianRelationships.metadata}).from(guardianRelationships).where(and(
       eq(guardianRelationships.studentPersonId,app.studentPersonId),
       eq(guardianRelationships.guardianPersonId,actor.actorPersonId),
     )).limit(1);
   if(!relation?.canManage||relation.metadata.verification!=="verified")
    throw new AuthorizationError("independently verified family relationship");
  }else assertCapability(actor,"enrollment.activate");
  // Return actionable readiness only AFTER the actor's exact school scope and
  // family relationship have passed. Mutations still enforce the same gate.
  try{await requireEligibleStudent(db,app);}
  catch(error){
   if(!(error instanceof StudentLearningBlocker))throw error;
   return {status:"blocked" as const,studentEmail:null,blocker:{code:error.code,
    message:error.messageForFamily,nextAction:error.nextAction,target:error.target,
    programId:app.programId,siteId:app.siteId,applicationId:app.id}};
  }
  const [consent]=await db.select({status:studentAccessConsents.status,
   studentEmail:studentAccessConsents.studentEmail,
   studentProfileId:studentAccessConsents.studentProfileId,
   programId:studentAccessConsents.programId,
   siteId:studentAccessConsents.siteId})
   .from(studentAccessConsents).where(eq(studentAccessConsents.applicationId,app.id)).limit(1);
  if(consent?.status==="approved"){
   // An approved parent consent is historical. An inactive student grant or
   // disabled account cannot sign in even though consent remains approved.
   const [grant]=await db.select({id:accountPersonGrants.id})
     .from(accessAccounts)
     .innerJoin(accountPersonGrants,eq(accountPersonGrants.accountId,accessAccounts.id))
     .where(and(
       eq(accessAccounts.emailNormalized,normalizeAccessEmail(consent.studentEmail)),
       eq(accessAccounts.disabled,false),
       eq(accountPersonGrants.personId,app.studentPersonId),
       eq(accountPersonGrants.organizationId,app.organizationId),
       eq(accountPersonGrants.siteId,app.siteId!),
       eq(accountPersonGrants.role,"student"),
       eq(accountPersonGrants.active,true),
       )).limit(1);
   if(!grant || consent.studentProfileId!==app.studentProfileId ||
       consent.programId!==app.programId || consent.siteId!==app.siteId)
     return {status:"access_unavailable" as const,
       studentEmail:consent.studentEmail,blocker:null};
  }
  return {status:consent?.status??"not_requested",
    studentEmail:consent?.studentEmail??null,blocker:null};
 });

export const provisionStudentLearningAccess=createServerFn({method:"POST"})
 .validator((v:unknown)=>studentAccessReviewInput.parse(v))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  if(actor.role!=="registrar"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("real school registrar");
  assertCapability(actor,"enrollment.activate");
  const email=await db.transaction(async tx=>{
   const app=await eligibleStudent(tx,data.applicationId);
   if(!actor.scope.programIds?.includes(app.programId)||
      !actor.scope.siteIds?.includes(app.siteId!)||
      !actor.scope.organizationIds?.includes(app.organizationId))
    throw new AuthorizationError("original school registrar scope");
   const [consent]=await tx.select().from(studentAccessConsents)
     .where(eq(studentAccessConsents.applicationId,app.id)).for("update").limit(1);
   if(!consent||!["pending_review","approved"].includes(consent.status)||
      consent.studentProfileId!==app.studentProfileId||
      consent.programId!==app.programId||consent.siteId!==app.siteId)
    throw new AuthorizationError("valid guardian consent pending independent registrar approval");
   if(consent.status==="pending_review"&&
      (data.confirmedIndependentIdentity!==true||!data.reviewMethod))
    throw new AuthorizationError("independent student identity verification and evidence method required");
   const [guardian]=await tx.select({permission:guardianRelationships.canManageEnrollment,
      metadata:guardianRelationships.metadata}).from(guardianRelationships).where(and(
       eq(guardianRelationships.guardianPersonId,consent.guardianPersonId),
       eq(guardianRelationships.studentPersonId,app.studentPersonId),
     )).limit(1);
   if(!guardian?.permission||guardian.metadata.verification!=="verified")
    throw new AuthorizationError("independently verified and current guardian consent");
   const normalized=normalizeAccessEmail(consent.studentEmail);
   const [student]=await tx.select({active:people.active,email:people.email})
     .from(people).where(eq(people.id,app.studentPersonId)).for("update").limit(1);
   if(!student?.active || (student.email && normalizeAccessEmail(student.email)!==normalized))
    throw new AuthorizationError("validated student identity and contact");
   let [account]=await tx.select({id:accessAccounts.id,disabled:accessAccounts.disabled})
     .from(accessAccounts).where(eq(accessAccounts.emailNormalized,normalized))
     .for("update").limit(1);
   if(account?.disabled)throw new AuthorizationError("student account disabled");
   if(account){
     const grants=await tx.select({
       personId:accountPersonGrants.personId,
       role:accountPersonGrants.role,
     }).from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id));
     if(grants.some(g=>g.personId!==app.studentPersonId))
      throw new AuthorizationError("student email is already bound to a different identity");
     // The passwordless email challenge chooses an active role from its
     // account. Do not create a student invitation on a teacher, guardian or
     // demo account: it could sign the child into another persona instead of
     // the independently consented learning account. Multiple same-child
     // student memberships across authorized Sites are still supported.
     if(grants.some(g=>g.role!=="student"))
      throw new AuthorizationError("student email requires a separate, real student-only account");
   }else {
     [account]=await tx.insert(accessAccounts).values({emailNormalized:normalized})
       .returning({id:accessAccounts.id,disabled:accessAccounts.disabled});
   }
   const [grant]=await tx.select({id:accountPersonGrants.id,active:accountPersonGrants.active})
     .from(accountPersonGrants).where(and(
      eq(accountPersonGrants.accountId,account!.id),
      eq(accountPersonGrants.personId,app.studentPersonId),
      eq(accountPersonGrants.organizationId,app.organizationId),
      eq(accountPersonGrants.siteId,app.siteId!),
      eq(accountPersonGrants.role,"student"),
     )).limit(1);
   if(grant && !grant.active)throw new AuthorizationError("revoked student grant requires staff reauthorization");
   if(!grant)await tx.insert(accountPersonGrants).values({
     accountId:account!.id,personId:app.studentPersonId,
     role:"student",organizationId:app.organizationId,siteId:app.siteId!,active:true,
   });
   if(!student.email)await tx.update(people).set({email:normalized,updatedAt:new Date()})
     .where(eq(people.id,app.studentPersonId));
   if(consent.status==="pending_review"){
     await tx.update(studentAccessConsents).set({
       status:"approved",reviewedByPersonId:actor.actorPersonId,
       reviewedAt:new Date(),updatedAt:new Date(),
     }).where(eq(studentAccessConsents.id,consent.id));
     // Only the first independently reviewed authorization emits the
     // institutional approval event. Passwordless resend is not a new
     // decision and must not duplicate official approval history.
     const approvalEventId=await emitEvent(tx,{eventType:EventTypes.StudentLearningAccessApproved,
       aggregateType:"student_access_consent",aggregateId:consent.id,
       actorPersonId:actor.actorPersonId,organizationId:app.organizationId,
       siteId:app.siteId!,programId:app.programId,
       payload:{applicationId:app.id,studentProfileId:app.studentProfileId}});
     await notify(tx,{
       recipientPersonId:consent.guardianPersonId,
       type:"student_access_approved",
       title:"Your student's CAN OS learning account was approved",
       body:"Admissions approved the separate student sign-in. Your student can use their own email address to request a secure sign-in link. Email delivery is not guaranteed.",
       resourceType:"application",resourceId:app.id,eventId:approvalEventId,
     });
   }
   await writeAudit(tx,{actorPersonId:actor.actorPersonId,
     action:consent.status==="pending_review"
       ?"student.access.registrar_approved":"student.access.login_link_requested",
     resourceType:"student_access_consent",
     resourceId:consent.id,
     scope:{organizationId:app.organizationId,programId:app.programId,siteId:app.siteId},
     after:{studentProfileId:app.studentProfileId,status:"approved",
       ...(consent.status==="pending_review"?{reviewMethod:data.reviewMethod}:{} )},
     context:{accountId:actor.accountId,sessionId:actor.sessionId}});
   return normalized;
  });
  // Email is never sent inside an open DB transaction. On delivery failure
  // the approved grant remains retryable through normal passwordless sign-in.
  try {
    await requestOneTimeAccess(email);
    // The passwordless API intentionally returns a generic acceptance result;
    // it may enforce cooldowns. Never claim provider or inbox delivery here.
    return {status:"approved" as const,signInRequest:"requested" as const};
  } catch {
    // The approval transaction already committed. Preserve that outcome so
    // the registrar can retry the link without repeating identity approval.
    return {status:"approved" as const,signInRequest:"failed" as const};
  }
 });
