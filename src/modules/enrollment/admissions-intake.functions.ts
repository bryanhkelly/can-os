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
import {assertSyntheticMutation} from "@/modules/_demo/demo-write-gate";
const uuid=z.string().uuid();
const applicant=z.object({
 programId:uuid, studentFirstName:z.string().trim().min(1).max(100),
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
 return rows.filter(r=>r.metadata.synthetic===true).map(r=>({
  ...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),
  disposition:r.metadata.admissionsDisposition==="waitlisted"?"waitlisted":r.metadata.admissionsDisposition==="offer_ready"?"ready_for_offer":null,
 }));
});
export const createAdmissionsInquiry=createServerFn({method:"POST"}).validator((v:unknown)=>applicant.parse(v))
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  const actor=await registrar();
  if(!actor.scope.programIds?.includes(data.programId))throw new AuthorizationError("admissions program");
  const [program]=await db.select({organizationId:programs.organizationId}).from(programs)
   .where(eq(programs.id,data.programId)).limit(1);
  if(!program||!actor.scope.organizationIds?.includes(program.organizationId))throw new AuthorizationError("admissions organization");
  return db.transaction(async tx=>{
   // A prospective guardian has a Person and relationship, but no account grant.
   // Being listed as the contact does not authenticate anyone as that person.
   const [guardian]=await tx.insert(people).values({
    legalFirstName:data.guardianFirstName,legalLastName:data.guardianLastName,email:data.guardianEmail,
    metadata:{synthetic:true,origin:"registrar_intake"},
   }).returning({id:people.id});
   const [studentPerson]=await tx.insert(people).values({
    legalFirstName:data.studentFirstName,legalLastName:data.studentLastName,
    metadata:{synthetic:true,origin:"registrar_intake"},
   }).returning({id:people.id});
   const [household]=await tx.insert(households).values({
    displayName:data.guardianLastName+" Household",primaryEmail:data.guardianEmail,
   }).returning({id:households.id});
   const [student]=await tx.insert(studentProfiles).values({personId:studentPerson!.id,
    gradeLevel:data.gradeLevel||null,metadata:{synthetic:true}}).returning({id:studentProfiles.id});
   await tx.insert(householdMemberships).values([
    {householdId:household!.id,personId:guardian!.id,relationshipLabel:"guardian",isPrimaryContact:true},
    {householdId:household!.id,personId:studentPerson!.id,relationshipLabel:"student"},
   ]);
   await tx.insert(guardianRelationships).values({guardianPersonId:guardian!.id,
    studentPersonId:studentPerson!.id,relationshipLabel:"guardian"});
   const [application]=await tx.insert(applications).values({
    householdId:household!.id,studentProfileId:student!.id,programId:data.programId,
    submittedByPersonId:actor.actorPersonId!,stage:"inquiry",
    idempotencyKey:"registrar-inquiry:"+crypto.randomUUID(),
    metadata:{synthetic:true,source:data.source,notes:data.notes??"",origin:"registrar_intake",contactPersonId:guardian!.id},
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
  assertSyntheticMutation("registrar");
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [app]=await tx.select().from(applications).where(eq(applications.id,data.applicationId))
    .for("update").limit(1);
   if(!app||app.metadata.synthetic!==true||!actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("admissions application");
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
  assertSyntheticMutation("registrar");
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [app]=await tx.select({
    id:applications.id,programId:applications.programId,metadata:applications.metadata,
   }).from(applications).where(eq(applications.id,data.applicationId)).limit(1);
   if(!app||app.metadata.synthetic!==true||!actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("admissions guardian provisioning");
   const [program]=await tx.select({organizationId:programs.organizationId,siteId:programs.siteId})
    .from(programs).where(eq(programs.id,app.programId)).limit(1);
   if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
    (actor.scope.siteIds?.length&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))
    throw new AuthorizationError("guardian membership scope");
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
