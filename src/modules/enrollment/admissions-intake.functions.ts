import {assertRecordWriteAllowed} from "@/modules/_demo/record-write-gate";
import {normalizeAccessEmail} from "@/domain/access-tokens";
import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,desc,eq,inArray,isNull} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {accessAccounts,accountPersonGrants,applications,auditEvents,domainEvents,guardianRelationships,householdMemberships,households,journeys,journeyRequirements,people,programs,studentProfiles} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {instantiateJourneyFromDefinition} from "@/modules/journeys/instantiate";
const uuid=z.string().uuid();
const applicant=z.object({
 requestId:uuid,programId:uuid,existingApplicationId:uuid.optional(), studentFirstName:z.string().trim().min(1).max(100),
 studentLastName:z.string().trim().min(1).max(100),gradeLevel:z.string().trim().max(10).optional(),
 guardianFirstName:z.string().trim().min(1).max(100),guardianLastName:z.string().trim().min(1).max(100),
 guardianEmail:z.string().trim().email(),source:z.string().trim().max(80).default("school_direct"),
 notes:z.string().trim().max(3000).optional(),
});
async function registrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.programIds?.length)throw new AuthorizationError("admissions registrar");
 assertCapability(actor,"enrollment.decide");
 return actor;
}
export const listAdmissionsIntakePrograms=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await registrar();
 return db.select({id:programs.id,name:programs.name}).from(programs)
  .where(and(inArray(programs.id,actor.scope.programIds!),
    inArray(programs.organizationId,actor.scope.organizationIds??[])))
  .orderBy(programs.name);
});
export const listAdmissionsIntake=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await registrar();
 const rows=await db.select({id:applications.id,stage:applications.stage,metadata:applications.metadata,
  createdAt:applications.createdAt,updatedAt:applications.updatedAt,programId:applications.programId,
  programName:programs.name,studentFirst:people.legalFirstName,studentLast:people.legalLastName})
  .from(applications)
  .innerJoin(programs,eq(programs.id,applications.programId))
  .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
  .innerJoin(people,eq(people.id,studentProfiles.personId))
  .where(inArray(applications.programId,actor.scope.programIds!))
  .orderBy(desc(applications.updatedAt)).limit(300);
 return rows.map(r=>({
  ...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),
  disposition:r.metadata.admissionsDisposition==="waitlisted"?"waitlisted":r.metadata.admissionsDisposition==="offer_ready"?"ready_for_offer":null,
 }));
});
export const createAdmissionsInquiry=createServerFn({method:"POST"}).validator((v:unknown)=>applicant.parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  if(!actor.scope.programIds?.includes(data.programId))throw new AuthorizationError("admissions program");
  const [program]=await db.select({organizationId:programs.organizationId}).from(programs)
   .where(eq(programs.id,data.programId)).limit(1);
  if(!program||!actor.scope.organizationIds?.includes(program.organizationId))throw new AuthorizationError("admissions organization");
  return db.transaction(async tx=>{
   const idempotencyKey="registrar-inquiry:"+data.requestId;
   const [repeat]=await tx.select({id:applications.id,programId:applications.programId})
    .from(applications).where(eq(applications.idempotencyKey,idempotencyKey)).limit(1);
   if(repeat){
    if(repeat.programId!==data.programId)throw new Error("Inquiry request key reused for another program");
    return {applicationId:repeat.id};
   }
   let guardianPersonId:string;
   let householdId:string;
   if(data.existingApplicationId){
    const [prior]=await tx.select({householdId:applications.householdId,
     metadata:applications.metadata,programId:applications.programId,
     organizationId:programs.organizationId})
     .from(applications).innerJoin(programs,eq(programs.id,applications.programId))
     .where(eq(applications.id,data.existingApplicationId)).limit(1);
    if(!prior||
     !actor.scope.programIds?.includes(prior.programId)||
     prior.organizationId!==program.organizationId)
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
    personId:studentPerson!.id,gradeLevel:data.gradeLevel||null,metadata:{synthetic:true},
   }).returning({id:studentProfiles.id});
   await tx.insert(householdMemberships).values({
    householdId,personId:studentPerson!.id,relationshipLabel:"student",
   });
   await tx.insert(guardianRelationships).values({
    guardianPersonId,studentPersonId:studentPerson!.id,relationshipLabel:"guardian",
    canViewAcademics:false,canManageEnrollment:false,canSubmitAttendanceExcuse:false,
    metadata:{verification:"pending",source:"registrar_intake"},
   });
   const [application]=await tx.insert(applications).values({
    householdId,studentProfileId:student!.id,programId:data.programId,
    submittedByPersonId:actor.actorPersonId!,stage:"inquiry",
    idempotencyKey,
    metadata:{synthetic:false,source:data.source,notes:data.notes??"",origin:"registrar_intake",contactPersonId:guardianPersonId},
   }).returning({id:applications.id});
   await tx.insert(domainEvents).values({eventType:"AdmissionsInquiryCreated",aggregateType:"application",
    aggregateId:application!.id,actorPersonId:actor.actorPersonId,
    payload:{programId:data.programId,studentProfileId:student!.id}});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    action:"admissions.inquiry.create",resourceType:"application",resourceId:application!.id,
    scope:{organizationId:program.organizationId,programId:data.programId},
    after:{stage:"inquiry",source:data.source}});
   return {applicationId:application!.id};
  });
 });
export const transitionAdmissionsStage=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({applicationId:uuid,
  decision:z.enum(["application","eligibility","accept","decline","withdraw","waitlist","restore"]),
  note:z.string().trim().max(2000).optional()}).parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [app]=await tx.select().from(applications).where(eq(applications.id,data.applicationId))
    .for("update").limit(1);
   if(!app||!actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("admissions application");
   assertRecordWriteAllowed(app.metadata,"registrar");
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
   const next=data.decision==="application"?"application":data.decision==="eligibility"?"eligibility":
    data.decision==="accept"?app.stage:data.decision==="decline"?"declined":
    data.decision==="withdraw"?"withdrawn":app.stage;
   let nextMetadata:Record<string,unknown>={...app.metadata};
   if(data.decision==="waitlist")nextMetadata={...nextMetadata,admissionsDisposition:"waitlisted"};
   if(data.decision==="accept")nextMetadata={...nextMetadata,admissionsDisposition:"offer_ready"};
   if(data.decision==="restore")nextMetadata={...nextMetadata,admissionsDisposition:null};
   if(data.decision==="eligibility" || data.decision==="accept"){
    const [journey]=await tx.select({id:journeys.id}).from(journeys)
     .where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,app.id))).limit(1);
    if(data.decision==="eligibility" && !journey){
     await instantiateJourneyFromDefinition(tx,{definitionKey:"family-enrollment",
      subjectType:"application",subjectId:app.id,programId:app.programId,ownerPersonId:actor.actorPersonId,
      insertErrorLabel:"Family enrollment"});
    }
    if(data.decision==="accept"){
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
   await tx.insert(domainEvents).values({eventType:"AdmissionsStageChanged",aggregateType:"application",
    aggregateId:app.id,actorPersonId:actor.actorPersonId,
    payload:{programId:app.programId,from:app.stage,to:next,decision:data.decision}});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    action:"admissions.stage."+data.decision,resourceType:"application",resourceId:app.id,
    scope:{programId:app.programId},before:{stage:app.stage,disposition:app.metadata.admissionsDisposition??null},
    after:{stage:next,disposition:nextMetadata.admissionsDisposition??null},context:{note:data.note??null}});
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
    id:applications.id,programId:applications.programId,metadata:applications.metadata,
   }).from(applications).where(eq(applications.id,data.applicationId)).limit(1);
   if(!app||!actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("admissions guardian provisioning");
   const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,app.programId)).limit(1);
   if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
    (actor.scope.siteIds?.length&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))
    throw new AuthorizationError("guardian membership scope");
   assertRecordWriteAllowed(app.metadata,"registrar");
   const contactId=String(app.metadata.contactPersonId??"");
   const [contact]=await tx.select({id:people.id,email:people.email})
    .from(people).where(eq(people.id,contactId)).limit(1);
   if(!contact?.email)throw new Error("Guardian contact email missing");
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
   const [grant]=await tx.select({id:accountPersonGrants.id})
    .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,account!.id),
     eq(accountPersonGrants.personId,contact.id),eq(accountPersonGrants.role,"guardian"),
     eq(accountPersonGrants.organizationId,program.organizationId),
     program.siteId?eq(accountPersonGrants.siteId,program.siteId):isNull(accountPersonGrants.siteId)))
    .limit(1);
   if(grant)return {created:false,email,accountId:account!.id};
   const [newGrant]=await tx.insert(accountPersonGrants).values({
    accountId:account!.id,personId:contact.id,role:"guardian",
    organizationId:program.organizationId,siteId:program.siteId,isSynthetic:true,
   }).returning({id:accountPersonGrants.id});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    action:"admissions.guardian_access.provision",resourceType:"account_person_grant",
    resourceId:newGrant!.id,scope:{organizationId:program.organizationId,
     programId:app.programId,siteId:program.siteId},
    after:{personId:contact.id,role:"guardian",applicationId:app.id},
    context:{synthetic:true}});
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
   metadata:applications.metadata}).from(applications)
   .where(eq(applications.id,data.applicationId)).limit(1);
  if(!application||!actor.scope.programIds?.includes(application.programId))
   throw new AuthorizationError("admissions invitation");
  const contactId=String(application.metadata.contactPersonId??"");
  const [contact]=await db.select({email:people.email})
   .from(people).where(eq(people.id,contactId)).limit(1);
  if(!contact?.email)throw new Error("Guardian email is missing");
  const [grant]=await db.select({id:accountPersonGrants.id})
   .from(accountPersonGrants)
   .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
   .where(and(eq(accountPersonGrants.personId,contactId),
    eq(accountPersonGrants.role,"guardian"),eq(accountPersonGrants.active,true),
    eq(accessAccounts.emailNormalized,normalizeAccessEmail(contact.email)))).limit(1);
  if(!grant)throw new Error("Provision the guardian's identity-bound access first");
  const {requestOneTimeAccess}=await import("@/modules/identity/passwordless-access.server");
  await requestOneTimeAccess(contact.email);
  await db.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
   action:"admissions.guardian.invite",resourceType:"application",
   resourceId:data.applicationId,scope:{programId:application.programId},
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
   }).from(applications).where(eq(applications.id,data.applicationId)).limit(1);
   if(!app||!actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("guardian relationship verification");
   assertRecordWriteAllowed(app.metadata,"registrar");
   const contactId=String(app.metadata.contactPersonId??"");
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
    metadata:{...relationship.metadata,verification:"verified",
     method:data.method,evidenceNote:data.evidenceNote,
     verifiedBy:actor.actorPersonId,verifiedAt:verifiedAt.toISOString()},
    updatedAt:verifiedAt,
   }).where(eq(guardianRelationships.id,relationship.id));
   await tx.insert(auditEvents).values({
    actorPersonId:actor.actorPersonId,
    action:"admissions.guardian_relationship.verify",
    resourceType:"guardian_relationship",resourceId:relationship.id,
    scope:{programId:app.programId},
    before:{verification:relationship.metadata.verification??"unverified"},
    after:{verification:"verified",method:data.method,
     studentProfileId:app.studentProfileId},
    context:{evidenceNote:data.evidenceNote},
   });
   return {verified:true};
  });
 });
