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
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { staffedPublishedSectionIds } from "./instructional-section-readiness.server";
import { requestOneTimeAccess } from "@/modules/identity/passwordless-access.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

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

async function eligibleStudent(tx:typeof db|Parameters<Parameters<typeof db.transaction>[0]>[0],applicationId:string){
 const [app]=await tx.select({
  id:applications.id,programId:applications.programId,
  studentProfileId:applications.studentProfileId,stage:applications.stage,
  studentPersonId:studentProfiles.personId,
  siteId:programs.siteId,organizationId:programs.organizationId,
 }).from(applications)
  .innerJoin(programs,eq(programs.id,applications.programId))
  .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
  .where(eq(applications.id,applicationId)).limit(1);
 if(!app?.siteId||app.stage!=="accepted")
  throw new AuthorizationError("accepted school application and active host Site");
 const active=await tx.select({schoolYearId:enrollments.schoolYearId})
  .from(enrollments).where(and(
   eq(enrollments.studentProfileId,app.studentProfileId),
   eq(enrollments.programId,app.programId),
   eq(enrollments.kind,"program"),eq(enrollments.status,"active"),
  ));
 if(!active.length)throw new AuthorizationError("active accepted student enrollment");
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
  active.some(a=>a.schoolYearId===row.sectionYearId))
  .map(row=>row.id);
 const ready=await staffedPublishedSectionIds(validIds,tx);
 if(!ready.size)throw new AuthorizationError("actual ready classroom placement");
 return app;
}

export const consentToStudentLearningAccount=createServerFn({method:"POST"})
 .validator((v:unknown)=>consentInput.parse(v))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  if(actor.role!=="guardian"||!actor.actorPersonId||actor.demoFacilitator)
   throw new AuthorizationError("real verified guardian");
  assertCapability(actor,"enrollment.apply");
  const studentEmail=normalizeAccessEmail(data.studentEmail);
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
  const app=await eligibleStudent(db,data.applicationId);
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
  const [consent]=await db.select({status:studentAccessConsents.status,
   studentEmail:studentAccessConsents.studentEmail})
   .from(studentAccessConsents).where(eq(studentAccessConsents.applicationId,app.id)).limit(1);
  return {status:consent?.status??"not_requested",studentEmail:consent?.studentEmail??null};
 });

export const provisionStudentLearningAccess=createServerFn({method:"POST"})
 .validator((v:unknown)=>studentAccessReviewInput.parse(v))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  if(actor.role!=="registrar"||!actor.actorPersonId||actor.demoFacilitator)
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
     const grants=await tx.select({personId:accountPersonGrants.personId})
       .from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id));
     if(grants.some(g=>g.personId!==app.studentPersonId))
      throw new AuthorizationError("student email is already bound to a different identity");
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
   }
   await emitEvent(tx,{eventType:"StudentLearningAccessApproved",
     aggregateType:"student_access_consent",aggregateId:consent.id,
     actorPersonId:actor.actorPersonId,organizationId:app.organizationId,
     siteId:app.siteId!,programId:app.programId,
     payload:{applicationId:app.id,studentProfileId:app.studentProfileId}});
   await writeAudit(tx,{actorPersonId:actor.actorPersonId,
     action:"student.access.registrar_approved",resourceType:"student_access_consent",
     resourceId:consent.id,
     scope:{organizationId:app.organizationId,programId:app.programId,siteId:app.siteId},
     after:{studentProfileId:app.studentProfileId,status:"approved",
       ...(consent.status==="pending_review"?{reviewMethod:data.reviewMethod}:{} )},
     context:{accountId:actor.accountId,sessionId:actor.sessionId}});
   return normalized;
  });
  // Email is never sent inside an open DB transaction. On delivery failure
  // the approved grant remains retryable through normal passwordless sign-in.
  await requestOneTimeAccess(email);
  return {status:"approved" as const};
 });
