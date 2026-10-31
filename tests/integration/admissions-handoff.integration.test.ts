import { describe,expect,it,vi } from "vitest";
import { and,eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { roleCapabilities } from "@/domain/access-context";
import type { Actor } from "@/modules/identity/actors.server";

type Transaction=Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Transaction|undefined,actor:undefined as Actor|undefined,
 verify:vi.fn(),sign:vi.fn(()=>"https://storage.example.invalid/signed"),
 studentInvite:vi.fn(async(_email:string)=>({accepted:true as const})),
 studentLink:"",
 failDocumentEvent:false,failStageEvent:false,failInquiryEvent:false}));
vi.mock("@/modules/enrollment/r2-documents.server",async importOriginal=>{
 const original=await importOriginal<typeof import("@/modules/enrollment/r2-documents.server")>();
 return {...original,verifyDocumentObject:state.verify,signR2Object:state.sign,r2Config:vi.fn(()=>({}))};
});
// Delivery is mocked, but identity/consent/grant writes remain canonical
// and part of the same rollback-only Neon acceptance journey.
vi.mock("@/modules/identity/passwordless-access.server",async importOriginal=>{
 const original=await importOriginal<typeof import("@/modules/identity/passwordless-access.server")>();
 return {...original,requestOneTimeAccess:state.studentInvite};
});
vi.mock("@/platform/mutation",async importOriginal=>{
 const original=await importOriginal<typeof import("@/platform/mutation")>();
 return {...original,emitEvent:async(...args:Parameters<typeof original.emitEvent>)=>{
 if(state.failInquiryEvent&&args[1].eventType==="AdmissionsInquiryCreated")throw new Error("Injected inquiry outbox failure");
 if(state.failStageEvent&&args[1].eventType==="AdmissionsStageChanged")throw new Error("Injected stage outbox failure");
  if(state.failDocumentEvent&&(args[1].eventType.startsWith("EnrollmentDocument")||
   args[1].eventType.startsWith("EnrollmentForm")))throw new Error("Injected document outbox failure");
  return original.emitEvent(...args);
 }};
});
vi.mock("@/db/client",()=>({
 get db(){if(!state.tx)throw new Error("Admissions handoff must stay in its rollback transaction");return state.tx;},
}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
  },
 }),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
 getCommandContext:async()=>{if(!state.actor)throw new Error("Missing admissions actor");return state.actor;},
}));
function first<T>(rows:T[]):T{
 const row=rows[0];if(!row)throw new Error("Missing admissions acceptance fixture");return row;
}
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("cross-persona admissions through active classes",()=>{
 it("uses actual commands for withdrawal, acceptance, readiness exceptions, activation and placement without re-keying identities",async()=>{
  const {db:database}=await vi.importActual<{db:Database}>("@/db/client");
  const s=await import("@/db/schema");
  const {startFamilyApplication}=await import("@/modules/enrollment/enrollment-service");
  const offers=await import("@/modules/enrollment/admissions-offer.functions");
  const {getGuardianAdmissionOffers}=await import("@/modules/enrollment/guardian-admission-offers.functions");
  const {getGuardianAssignments,getGuardianStudents}=await import("@/modules/learning/guardian-academic-queries.functions");
  const {getGuardianGradeResponse}=await import("@/modules/learning/guardian-grade-response.functions");
  const {setFamilyRequirement,reviewRequirementDocument,addRequirementReviewNote}=await import("@/modules/enrollment/family-readiness.functions");
  const {getGuardianEnrollmentChecklist}=await import("@/modules/enrollment/guardian-enrollment-checklist.functions");
  const documentFlow=await import("@/modules/enrollment/r2-document-upload.functions");
  const formFlow=await import("@/modules/enrollment/enrollment-form.functions");
  const {completeJourneyRequirement}=await import("@/modules/journeys/complete-requirement");
  const intake=await import("@/modules/enrollment/admissions-intake.functions");
  const {getAdmissionsDashboard}=await import("@/modules/enrollment/admissions-dashboard.functions");
  const {placeEnrolledStudent,listEnrollmentPlacements}=await import("@/modules/enrollment/course-placement.functions");
  const {getFamilyHome,getGuardianNeedsYou}=await import("@/modules/family/family-home.functions");
  const {listExpectedOnsiteRoster,markExpectedOnsiteAttendance}
   =await import("@/modules/attendance/onsite-attendance-workflow.functions");
  const {getMyStudentToday}=await import("@/modules/student-experience/student-today.functions");
  const {accessibleClasses,authorizeClass}=await import("@/modules/learning/class-access.server");
  const {getClassWorkspace}=await import("@/modules/learning/class-workspace.functions");
  const {
   getGradebookSections,getGradebook,createAssessment,gradeSubmission,
   manageAssessment,returnSubmissionForRevision,
  }=await import("@/modules/learning/gradebook.functions");
  const {
   getAssignments,saveAssignmentResponse,saveAssignmentDraft,
  }=await import("@/modules/student-experience/assignments.functions");
  const {
   createSubmissionAttachmentUpload,listSubmissionAttachments,
  }=await import("@/modules/learning/submission-attachments.functions");
  const {getTeacherToday}=await import("@/modules/learning/teacher-today.functions");
  const access=await vi.importActual<typeof import("@/modules/identity/passwordless-access.server")>(
   "@/modules/identity/passwordless-access.server");
  const sessionAuth=await vi.importActual<typeof import("@/modules/identity/command-context.server")>(
   "@/modules/identity/command-context.server");
  const {
   getStudentLearningHandoff,consentToStudentLearningAccount,provisionStudentLearningAccess,
  }=await import("@/modules/enrollment/student-access-handoff.functions");
  const {getNotifications}=await import("@/modules/communication/notification-center.functions");
  const rollback=new Error("rollback-admissions-handoff");
  const suffix=crypto.randomUUID().slice(0,8);
  let applicationId="",profileId="",enrollmentId="",withdrawnOfferId="",documentId="",formRequirementId="";
  let checked=false;
  try{
   vi.stubEnv("CAN_R2_LIVE_UPLOADS_ENABLED","true");
   vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","test-accepted-family-student-login-pepper-over-32-characters");
   vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN","https://app.can-os.com");
   state.studentLink="";
   state.studentInvite.mockImplementation((address:string)=>
    access.requestOneTimeAccess(address,async message=>{
     expect(message.to).toBe(address);
     state.studentLink=message.accessUrl;
    }));
   state.verify.mockReset().mockResolvedValue(undefined);
   await database.transaction(async tx=>{
    state.tx=tx;
    const org=first(await tx.insert(s.organizations).values({type:"christian_school",
     name:"Admissions acceptance",slug:`admission-handoff-${suffix}`}).returning());
    const site=first(await tx.insert(s.sites).values({organizationId:org.id,name:"Admissions site",
     slug:`admission-handoff-${suffix}`}).returning());
    const jurisdiction=first(await tx.insert(s.jurisdictions).values({
     code:`admission-handoff-${suffix}`,name:"Synthetic acceptance jurisdiction"}).returning());
    const program=first(await tx.insert(s.programs).values({organizationId:org.id,siteId:site.id,
     jurisdictionId:jurisdiction.id,type:"full_school",status:"active",name:"Admissions Academy",
     slug:`admission-handoff-${suffix}`,gradeRange:{min:"6",max:"12"},deliveryModel:{onsite:true},
     academicProviderOrganizationId:org.id,creditIssuingOrganizationId:org.id}).returning());
    const {createAcademicTimeFixture}=await import("./helpers/academic-time");
    const time=await createAcademicTimeFixture({organizationId:org.id,siteId:site.id,programId:program.id,suffix});
    await tx.insert(s.admissionSeatPools).values({programId:program.id,schoolYearId:time.schoolYear.id,capacity:1});
    const guardian=first(await tx.insert(s.people).values({legalFirstName:"Admissions",legalLastName:"Guardian"}).returning());
    const registrar=first(await tx.insert(s.people).values({legalFirstName:"Admissions",legalLastName:"Registrar"}).returning());
    const outsider=first(await tx.insert(s.people).values({legalFirstName:"Unrelated",legalLastName:"Guardian"}).returning());
    function act(role:"guardian"|"registrar"|"student"|"teacher",personId:string):Actor{
     const actor:Actor={actorPersonId:personId,role,accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),
      grantId:crypto.randomUUID(),capabilities:new Set(roleCapabilities[role]),
      scope:{organizationIds:[org.id],siteIds:[site.id],programIds:[program.id]}};
     state.actor=actor;return actor;
    }
    const key=`admission-handoff-${suffix}`;
    await tx.insert(s.journeyDefinitions).values({key,version:"1",audience:"family",owningOrganizationId:org.id,
     title:"Enrollment readiness",configuration:{requirements:[
      {key:"review",title:"Registrar enrollment review",blocking:true,owner:"can"},
      {key:"signed-form",title:"Configured enrollment form",blocking:true,owner:"family",enrollmentForm:{
       version:"approved-test-v1",instructions:"Synthetic school-approved instructions. No real agreement is signed.",
       consent:"I acknowledge this synthetic enrollment statement for the acceptance test.",
       fields:[{key:"contact_plan",label:"Contact plan",type:"text",required:true},
        {key:"school_contact",label:"May the school contact you?",type:"yes_no",required:true}]}}
     ]}});
    // The student invitation must be authorized by a REAL verified adult
    // account, not only the test's synthetic command-context role.
    const [guardianAccount]=await tx.insert(s.accessAccounts).values({
      emailNormalized:`parent-${suffix}@example.org`,
      emailVerifiedAt:new Date(),
    }).returning();
    const [guardianGrant]=await tx.insert(s.accountPersonGrants).values({
      accountId:guardianAccount!.id,personId:guardian.id,role:"guardian",
      organizationId:org.id,siteId:site.id,active:true,isSynthetic:false,
    }).returning();
    const family=act("guardian",guardian.id);
    family.accountId=guardianAccount!.id;
    family.grantId=guardianGrant!.id;
    family.grantSiteId=site.id;
    const app=await startFamilyApplication(family,{programId:program.id,idempotencyKey:key,journeyDefinitionKey:key,
     student:{legalFirstName:"Accepted",legalLastName:"Learner",gradeLevel:"9"}});
    applicationId=app.applicationId;profileId=app.studentProfileId;
    const student=first(await tx.select().from(s.studentProfiles).where(eq(s.studentProfiles.id,profileId)));
    // An unverified application never automatically establishes child-record
    // access. This test explicitly simulates a separate authorized registrar
    // identity check before proceeding to the guardian's enrollment forms.
    await tx.update(s.guardianRelationships).set({
      canViewAcademics:true,canManageEnrollment:true,canSubmitAttendanceExcuse:true,
      metadata:{verification:"verified",source:"synthetic_independent_review"},
    }).where(and(eq(s.guardianRelationships.guardianPersonId,guardian.id),
      eq(s.guardianRelationships.studentPersonId,student.personId)));
    const requirement=first(await tx.select().from(s.journeyRequirements).where(and(
     eq(s.journeyRequirements.journeyId,app.journeyId),eq(s.journeyRequirements.key,"review"))));
    const formRequirement=first(await tx.select().from(s.journeyRequirements).where(and(
     eq(s.journeyRequirements.journeyId,app.journeyId),eq(s.journeyRequirements.key,"signed-form"))));
    formRequirementId=formRequirement.id;
    await tx.update(s.journeyDefinitions).set({configuration:{requirements:[]}}).where(eq(s.journeyDefinitions.key,key));
    const staff=act("registrar",registrar.id);
    const issuance={applicationId,schoolYearId:time.schoolYear.id};
    // Real institution-wide registrar grants do not enumerate Program IDs.
    // Exercise the same commands as the actual admissions handoff, not a
    // synthetic permission helper, while the Journey is still incomplete.
    state.actor={...staff,scope:{organizationIds:[org.id]}};
    expect((await getAdmissionsDashboard({data:{programId:program.id}})).map(row=>row.id))
     .toContain(applicationId);
    expect((await offers.getAdmissionOfferOptions({data:{programId:program.id}}))
     .find(row=>row.applicationId===applicationId)?.years.map(year=>year.id))
     .toContain(time.schoolYear.id);
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("Journey must be ready");
    // A registrar limited to a different Site must not reach this application.
    state.actor={...staff,scope:{organizationIds:[org.id],siteIds:[crypto.randomUUID()]}};
    await expect(offers.issueAdmissionOffer({data:issuance}))
     .rejects.toThrow("admissions program membership");
    state.actor=staff;
    await expect(offers.issueAdmissionOffer({data:{...issuance,applicationId:"not-a-uuid"}})).rejects.toThrow();
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("Journey must be ready");
    await setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:true}});
    await setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:true}});
    expect(await tx.select().from(s.domainEvents).where(and(
     eq(s.domainEvents.aggregateId,requirement.id),eq(s.domainEvents.eventType,"JourneyRequirementStatusChanged")))).toHaveLength(1);
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("Journey must be ready");
    const formScope={applicationId,requirementId:formRequirement.id};
    await expect(setFamilyRequirement({data:{...formScope,complete:true}})).rejects.toThrow("without a checklist waiver");
    await expect(completeJourneyRequirement({...staff,capabilities:new Set([...staff.capabilities,"journey.requirement.complete"])},
     formRequirement.id)).rejects.toThrow("registrar review workflow");
    await tx.update(s.journeyRequirements).set({status:"complete"}).where(eq(s.journeyRequirements.id,formRequirement.id));
    await tx.update(s.journeys).set({status:"ready"}).where(eq(s.journeys.id,app.journeyId));
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("current guardian signature and registrar approval");
    await tx.update(s.journeyRequirements).set({status:"needs_you"}).where(eq(s.journeyRequirements.id,formRequirement.id));
    await tx.update(s.journeys).set({status:"in_progress"}).where(eq(s.journeys.id,app.journeyId));
    await expect(reviewRequirementDocument({data:{...formScope,status:"accepted",reason:"Cannot replace consent"}}))
     .rejects.toThrow("not document approval");
    state.actor=family;
    await expect(documentFlow.beginEnrollmentDocumentUpload({data:{...formScope,fileName:"signature.pdf",mimeType:"application/pdf",size:128}}))
     .rejects.toThrow("cannot replace its signature");
    const readForm=async()=>{
     const row=first((await getGuardianEnrollmentChecklist({data:{applicationId}})).requirements.filter(item=>item.id===formRequirement.id));
     if(!row.form)throw new Error("Missing configured form");
     return row.form;
    };
    const configured=await readForm();
    expect(configured.form.version).toBe("approved-test-v1");
    const signed={...formScope,requestId:crypto.randomUUID(),formRevision:configured.revision,
     answers:{contact_plan:"Email the authorized guardian.",school_contact:false},signerName:"Admissions Guardian",confirmed:true as const};
    act("guardian",outsider.id);
    await expect(formFlow.submitGuardianEnrollmentForm({data:signed})).rejects.toThrow("current managing guardian");
    state.actor={...family,scope:{...family.scope,programIds:[]}};
    await expect(formFlow.submitGuardianEnrollmentForm({data:signed})).rejects.toThrow("school and program scope");
    state.actor=family;
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,confirmed:false}})).rejects.toThrow();
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,form:{consent:"Injected alternate consent"}}})).rejects.toThrow();
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,answers:{contact_plan:""}}})).rejects.toThrow("Complete Contact plan");
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,formRevision:"f".repeat(64)}})).rejects.toThrow("form changed");
    state.failDocumentEvent=true;
    await expect(formFlow.submitGuardianEnrollmentForm({data:signed})).rejects.toThrow("outbox failure");
    state.failDocumentEvent=false;
    expect((await readForm()).submission).toBeNull();
    await formFlow.submitGuardianEnrollmentForm({data:signed});
    expect(await formFlow.submitGuardianEnrollmentForm({data:signed})).toEqual({submissionId:signed.requestId});
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,signerName:"Changed signer"}})).rejects.toThrow("different input");
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...signed,requestId:crypto.randomUUID()}})).rejects.toThrow("awaiting registrar review");
    expect((await readForm()).submission).toMatchObject({signerPersonId:guardian.id,answers:signed.answers});
    await expect(formFlow.decideEnrollmentForm({data:{...formScope,submissionId:signed.requestId,status:"accepted",reason:"Checked signed form.",confirmed:true}}))
     .rejects.toThrow("registrar");
    state.actor=staff;
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("Journey must be ready");
    const correction={...formScope,submissionId:signed.requestId,status:"rejected" as const,
     reason:"Please provide the preferred contact window before signing again.",confirmed:true as const};
    await formFlow.decideEnrollmentForm({data:correction});
    await formFlow.decideEnrollmentForm({data:correction});
    state.actor=family;
    expect((await readForm()).review?.reason).toBe(correction.reason);
    expect((await getNotifications()).find(row=>row.title==="Enrollment form needs correction")?.href)
     .toContain(`application=${applicationId}`);
    const corrected={...signed,requestId:crypto.randomUUID(),
     answers:{contact_plan:"Email the authorized guardian after 3 PM.",school_contact:true}};
    await formFlow.submitGuardianEnrollmentForm({data:corrected});
    state.actor=staff;
    await expect(formFlow.decideEnrollmentForm({data:correction})).rejects.toThrow("submission changed");
    const approveForm={...correction,submissionId:corrected.requestId,status:"accepted" as const,reason:"Reviewed the corrected signed school form."};
    await tx.update(s.guardianRelationships).set({canManageEnrollment:false}).where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
    await expect(formFlow.decideEnrollmentForm({data:approveForm})).rejects.toThrow("signer is no longer authorized");
    await tx.update(s.guardianRelationships).set({canManageEnrollment:true}).where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
    state.failDocumentEvent=true;
    await expect(formFlow.decideEnrollmentForm({data:approveForm})).rejects.toThrow("outbox failure");
    state.failDocumentEvent=false;
    expect(first(await tx.select().from(s.journeyRequirements).where(eq(s.journeyRequirements.id,formRequirement.id))).status).toBe("needs_can");
    await formFlow.decideEnrollmentForm({data:approveForm});
    await formFlow.decideEnrollmentForm({data:approveForm});
    await expect(formFlow.decideEnrollmentForm({data:{...approveForm,reason:"Changed decision reason."}})).rejects.toThrow("different review");
    state.actor=family;
    await expect(formFlow.submitGuardianEnrollmentForm({data:{...corrected,requestId:crypto.randomUUID()}})).rejects.toThrow("already been approved");
    state.actor=staff;
    for(const eventType of ["EnrollmentFormSigned","EnrollmentFormReviewed"]){
     expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,formRequirement.id),
      eq(s.domainEvents.eventType,eventType)))).toHaveLength(2);
    }
    const formAudits=await tx.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,formRequirement.id));
    expect(formAudits.filter(row=>row.action==="enrollment.form.sign")).toHaveLength(2);
    expect(formAudits.filter(row=>row.action==="enrollment.form.review")).toHaveLength(2);
    expect(JSON.stringify(formAudits)).not.toContain(corrected.answers.contact_plan);
    await tx.update(s.applications).set({stage:"eligibility"}).where(eq(s.applications.id,applicationId));
    state.actor={...staff,scope:{...staff.scope,siteIds:[]}};
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}}))
     .rejects.toThrow("school and organization");
    state.actor=family;
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}})).rejects.toThrow("registrar");
    state.actor=staff;
    state.failStageEvent=true;
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}})).rejects.toThrow("stage outbox failure");
    state.failStageEvent=false;
    expect(first(await tx.select().from(s.applications).where(eq(s.applications.id,applicationId))).metadata.admissionsDisposition).not.toBe("waitlisted");
    await intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}});
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}})).rejects.toThrow("not permitted");
    await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow("Restore the waitlisted");
    expect(first(await getAdmissionsDashboard({data:{programId:program.id,siteId:site.id}})).disposition).toBe("waitlisted");
    state.actor=family;
    expect(first(await getGuardianAdmissionOffers({data:{}})).waitlisted).toBe(true);
    state.actor=staff;
    await intake.transitionAdmissionsStage({data:{applicationId,decision:"restore"}});
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"restore"}})).rejects.toThrow("not permitted");
    const restored=first(await tx.select().from(s.applications).where(eq(s.applications.id,applicationId)));
    expect(restored).toMatchObject({householdId:app.householdId,studentProfileId:profileId,stage:"eligibility"});
    for(const action of ["admissions.stage.waitlist","admissions.stage.restore"])
     expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,applicationId),eq(s.auditEvents.action,action)))).toHaveLength(1);
    expect(await tx.select().from(s.journeys).where(eq(s.journeys.participantId,applicationId))).toHaveLength(1);
    // The successful offer must also work under the institution-wide grant.
    state.actor={...staff,scope:{organizationIds:[org.id]}};
    const issued=await offers.issueAdmissionOffer({data:issuance});
    state.actor=staff;
    withdrawnOfferId=issued.offerId;
    expect(await offers.issueAdmissionOffer({data:issuance})).toEqual(issued);
    for(const decision of ["waitlist","decline","withdraw"] as const)
     await expect(intake.transitionAdmissionsStage({data:{applicationId,decision}})).rejects.toThrow("Withdraw each");
    // Simulate pre-existing inconsistent data: stale issued offers must not revive a closed/waitlisted application.
    for(const stage of ["withdrawn","declined","eligibility"] as const){
     await tx.update(s.applications).set({stage,metadata:stage==="eligibility"?{admissionsDisposition:"waitlisted"}:{}})
      .where(eq(s.applications.id,applicationId));
     state.actor=family;
     const staleOffer=first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===issued.offerId);
     expect(staleOffer?.progress).toMatchObject({state:"application_unavailable",canAccept:false});
     await expect(offers.respondToAdmissionOffer({data:{...issued,decision:"accept"}})).rejects.toThrow(/not open|Restore the waitlisted/);
     state.actor=staff;
     await expect(offers.issueAdmissionOffer({data:issuance})).rejects.toThrow(/not open|Restore the waitlisted/);
     expect(first(await tx.select().from(s.admissionOffers).where(eq(s.admissionOffers.id,issued.offerId))).status).toBe("issued");
    }
    await tx.update(s.applications).set({stage:"eligibility",metadata:restored.metadata}).where(eq(s.applications.id,applicationId));
    await expect(offers.activateOfferedEnrollment({data:issued})).rejects.toThrow("Guardian must accept");
    act("guardian",guardian.id);
    const withdraw={...issued,reason:"Correct the offer before a family accepts this seat.",confirmed:true as const};
    await expect(offers.withdrawIssuedAdmissionOffer({data:withdraw})).rejects.toThrow("registrar admission");
    state.actor=staff;
    await expect(offers.withdrawIssuedAdmissionOffer({data:{...withdraw,confirmed:false}})).rejects.toThrow();
    await expect(offers.withdrawIssuedAdmissionOffer({data:{...withdraw,reason:"short"}})).rejects.toThrow();
    await offers.withdrawIssuedAdmissionOffer({data:withdraw});
    await offers.withdrawIssuedAdmissionOffer({data:withdraw});
    await expect(offers.withdrawIssuedAdmissionOffer({data:{...withdraw,reason:"Changed reason after withdrawal"}})).rejects.toThrow("different reason");
    state.actor=family;
    expect(first(first(await getGuardianAdmissionOffers({data:{}})).offers).progress.state).toBe("revoked");
    await expect(offers.respondToAdmissionOffer({data:{...issued,decision:"accept"}})).rejects.toThrow("Invalid offer transition");
    state.actor=staff;
    await intake.transitionAdmissionsStage({data:{applicationId,decision:"waitlist"}});
    await intake.transitionAdmissionsStage({data:{applicationId,decision:"restore"}});
    const current=await offers.issueAdmissionOffer({data:issuance});
    expect(current.offerId).not.toBe(issued.offerId);
    state.actor={...staff,scope:{...staff.scope,programIds:[]}};
    await expect(offers.activateOfferedEnrollment({data:current})).rejects.toThrow("admissions program membership");
    state.actor=staff;
    await setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:false}});
    state.actor=family;
    const pending=first(await getGuardianAdmissionOffers({data:{}}));
    expect(pending.blockers).toEqual([{id:requirement.id,title:requirement.title,status:"needs_you"}]);
    expect(pending.offers.find(offer=>offer.id===current.offerId)?.progress.canAccept).toBe(false);
    await expect(offers.respondToAdmissionOffer({data:{...current,decision:"accept"}})).rejects.toThrow("Journey must be ready");
    act("guardian",outsider.id);
    expect(await getGuardianAdmissionOffers({data:{}})).toEqual([]);
    await expect(offers.respondToAdmissionOffer({data:{...current,decision:"accept"}})).rejects.toThrow("Guardian relationship");
    state.actor=staff;
    await setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:true}});
    state.actor=family;
    expect((await getFamilyHome()).children).toEqual([]);
    act("student",student.personId);
    await expect(getMyStudentToday()).rejects.toThrow("active student membership");
    state.actor=family;
    await offers.respondToAdmissionOffer({data:{...current,decision:"accept"}});
    await offers.respondToAdmissionOffer({data:{...current,decision:"accept"}});
    expect(first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===current.offerId)?.progress.state)
     .toBe("awaiting_activation");
    state.actor=staff;
    // Accepted offers cannot be closed through intake even if older data still says eligibility.
    await tx.update(s.applications).set({stage:"eligibility"}).where(eq(s.applications.id,applicationId));
    await expect(intake.transitionAdmissionsStage({data:{applicationId,decision:"withdraw"}})).rejects.toThrow("accepted offer");
    await tx.update(s.applications).set({stage:"accepted"}).where(eq(s.applications.id,applicationId));
    await expect(offers.withdrawIssuedAdmissionOffer({data:{...withdraw,...current}})).rejects.toThrow("unaccepted issued");
    await setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:false}});
    await expect(offers.activateOfferedEnrollment({data:current})).rejects.toThrow("Journey must be ready");
    const scope={applicationId,requirementId:requirement.id};
    const request={...scope,status:"requested" as const,reason:"Please upload the requested enrollment evidence."};
    await addRequirementReviewNote({data:{...scope,note:"Internal registrar discussion must not reach the family."}});
    state.failDocumentEvent=true;
    await expect(reviewRequirementDocument({data:request})).rejects.toThrow("outbox failure");
    state.failDocumentEvent=false;
    expect(await tx.select().from(s.notifications).where(and(eq(s.notifications.recipientPersonId,guardian.id),
     eq(s.notifications.type,"enrollment_document_requested")))).toEqual([]);
    await reviewRequirementDocument({data:request});
    await reviewRequirementDocument({data:request});
    await expect(setFamilyRequirement({data:{...scope,complete:true}})).rejects.toThrow("Review and accept");
    state.actor=family;
    const checklist=await getGuardianEnrollmentChecklist({data:{applicationId}});
    expect(checklist).toMatchObject({closed:false,synthetic:false});
    expect(first(checklist.requirements.filter(item=>item.id===requirement.id)))
     .toMatchObject({correctionReason:request.reason,reviewStatus:"requested"});
    const readDocumentRequirement=async()=>first((await getGuardianEnrollmentChecklist({data:{applicationId}}))
     .requirements.filter(item=>item.id===requirement.id));
    expect(JSON.stringify(checklist)).not.toContain("Internal registrar");
    expect(JSON.stringify(checklist)).not.toContain("storageKey");
    expect((await getNotifications()).find(row=>row.title==="Enrollment document requested")?.href)
     .toBe(`/guardian/admission-offers?student=${student.personId}&application=${applicationId}`);
    const upload={...scope,fileName:"enrollment.pdf",mimeType:"application/pdf",size:128};
    vi.stubEnv("CAN_R2_LIVE_UPLOADS_ENABLED","false");
    await expect(documentFlow.beginEnrollmentDocumentUpload({data:upload})).rejects.toThrow("not enabled");
    vi.stubEnv("CAN_R2_LIVE_UPLOADS_ENABLED","true");
    const firstUpload=await documentFlow.beginEnrollmentDocumentUpload({data:upload});
    state.verify.mockRejectedValueOnce(new Error("Object size or signature mismatch"));
    await expect(documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:firstUpload.key}})).rejects.toThrow("signature mismatch");
    expect(await tx.select().from(s.documents).where(eq(s.documents.subjectId,requirement.id))).toEqual([]);
    state.failDocumentEvent=true;
    await expect(documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:firstUpload.key}})).rejects.toThrow("outbox failure");
    state.failDocumentEvent=false;
    expect(await tx.select().from(s.documents).where(eq(s.documents.subjectId,requirement.id))).toEqual([]);
    const recorded=await documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:firstUpload.key}});
    documentId=recorded.documentId;
    expect(await documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:firstUpload.key}})).toEqual({...recorded,created:false});
    await expect(documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:firstUpload.key,fileName:"changed.pdf"}}))
     .rejects.toThrow("different input");
    expect(await readDocumentRequirement())
     .toMatchObject({reviewStatus:"received",correctionReason:null,documents:[{id:documentId,current:true,canDownload:true}]});
    state.actor=staff;
    await expect(offers.activateOfferedEnrollment({data:current})).rejects.toThrow("Journey must be ready");
    await expect(setFamilyRequirement({data:{...scope,complete:true}})).rejects.toThrow("Review and accept");
    const rejection={...scope,status:"rejected" as const,documentId,reason:"The file is unreadable. Please upload a clear copy."};
    await reviewRequirementDocument({data:rejection});
    await reviewRequirementDocument({data:rejection});
    state.actor=family;
    expect((await readDocumentRequirement()).correctionReason).toBe(rejection.reason);
    expect((await getNotifications()).filter(row=>row.title==="Enrollment document needs correction")).toHaveLength(1);
    expect(await documentFlow.getEnrollmentDocumentDownload({data:{...scope,documentId}})).toMatchObject({expiresInSeconds:60});
    const replacement=await documentFlow.beginEnrollmentDocumentUpload({data:upload});
    const replaced=await documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:replacement.key}});
    expect((await readDocumentRequirement()).documents).toEqual(expect.arrayContaining([
     expect.objectContaining({id:documentId,current:false,canDownload:false}),
     expect.objectContaining({id:replaced.documentId,current:true,reviewStatus:"received"}),
    ]));
    await expect(documentFlow.getEnrollmentDocumentDownload({data:{...scope,documentId}})).rejects.toThrow("current verified");
    state.actor=staff;
    await expect(reviewRequirementDocument({data:{...scope,status:"accepted",documentId,reason:""}})).rejects.toThrow("Superseded");
    const acceptance={...scope,status:"accepted" as const,documentId:replaced.documentId,reason:"Evidence reviewed."};
    await reviewRequirementDocument({data:acceptance});
    await reviewRequirementDocument({data:acceptance});
    expect(first(await tx.select().from(s.journeys).where(eq(s.journeys.id,app.journeyId))).status).toBe("ready");
    state.actor=family;
    state.verify.mockImplementationOnce(async()=>{
     await tx.update(s.guardianRelationships).set({canManageEnrollment:false})
      .where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
    });
    const lateUpload=await documentFlow.beginEnrollmentDocumentUpload({data:upload});
    await expect(documentFlow.finishEnrollmentDocumentUpload({data:{...upload,key:lateUpload.key}})).rejects.toThrow("current managing guardian");
    expect(await getGuardianAdmissionOffers({data:{}})).toEqual([]);
    await expect(getGuardianEnrollmentChecklist({data:{applicationId}})).rejects.toThrow("current managing guardian");
    expect((await getNotifications()).find(row=>row.title==="Enrollment document needs correction")?.href).toBeNull();
    await tx.update(s.guardianRelationships).set({canManageEnrollment:true}).where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
    state.actor={...family,scope:{...family.scope,siteIds:[]}};
    await expect(getGuardianEnrollmentChecklist({data:{applicationId}})).rejects.toThrow("school and program scope");
    await expect(documentFlow.beginEnrollmentDocumentUpload({data:upload})).rejects.toThrow("school and program scope");
    state.actor={...family,capabilities:new Set()};
    await expect(getGuardianEnrollmentChecklist({data:{applicationId}})).rejects.toThrow("enrollment.apply");
    await expect(documentFlow.beginEnrollmentDocumentUpload({data:upload})).rejects.toThrow("enrollment.apply");
    act("guardian",outsider.id);
    await expect(getGuardianEnrollmentChecklist({data:{applicationId}})).rejects.toThrow("current managing guardian");
    act("student",student.personId);
    await expect(getGuardianEnrollmentChecklist({data:{applicationId}})).rejects.toThrow("guardian");
    state.actor=family;
    await expect(getGuardianEnrollmentChecklist({data:{applicationId:"not-a-uuid"}})).rejects.toThrow();
    await expect(getGuardianEnrollmentChecklist({data:{applicationId,actorPersonId:guardian.id}})).rejects.toThrow();
    state.actor=staff;
    await tx.update(s.guardianRelationships).set({canManageEnrollment:false})
     .where(and(eq(s.guardianRelationships.guardianPersonId,guardian.id),eq(s.guardianRelationships.studentPersonId,student.personId)));
    await expect(offers.activateOfferedEnrollment({data:current})).rejects.toThrow("Guardian is not authorized");
    await tx.update(s.guardianRelationships).set({canManageEnrollment:true})
     .where(and(eq(s.guardianRelationships.guardianPersonId,guardian.id),eq(s.guardianRelationships.studentPersonId,student.personId)));
    // An accepted offer may exist before school opening; active enrollment may not.
    await tx.update(s.programs).set({status:"launching"}).where(eq(s.programs.id,program.id));
    await expect(offers.activateOfferedEnrollment({data:current}))
     .rejects.toThrow("School must be activated");
    expect(await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(
     eq(s.enrollments.studentProfileId,profileId),eq(s.enrollments.programId,program.id),
     eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")))).toHaveLength(0);
    await tx.update(s.programs).set({status:"active"}).where(eq(s.programs.id,program.id));
    // Enrollment activation is the other half of the institutional handoff.
    state.actor={...staff,scope:{organizationIds:[org.id]}};
    const activated=await offers.activateOfferedEnrollment({data:current});
    state.actor=staff;
    enrollmentId=activated.enrollmentId;
    expect(await offers.activateOfferedEnrollment({data:current})).toEqual(activated);
    state.actor=family;
    expect((await getGuardianEnrollmentChecklist({data:{applicationId}})).closed).toBe(true);
    await expect(documentFlow.beginEnrollmentDocumentUpload({data:upload})).rejects.toThrow("closed or unavailable");
    state.actor=staff;
    await expect(reviewRequirementDocument({data:acceptance})).rejects.toThrow("Journey cannot be edited");
    expect(first(await getAdmissionsDashboard({data:{programId:program.id,siteId:site.id}})).enrollments)
     .toEqual([{schoolYearId:time.schoolYear.id,status:"active"}]);
    state.actor=family;
    expect(first((await getFamilyHome()).children)).toMatchObject({studentProfileId:profileId,awaitingSections:true});
    expect(first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===current.offerId)?.progress.state)
     .toBe("awaiting_classes");
    const learner=act("student",student.personId);
    expect((await getMyStudentToday()).sections).toEqual([]);
    expect((await getNotifications()).filter(row=>row.title==="Enrollment confirmed")).toHaveLength(1);
    state.actor={...learner,scope:{...learner.scope,programIds:[]}};
    await expect(getMyStudentToday()).rejects.toThrow("active student membership");
    const course=first(await tx.insert(s.courseTemplates).values({owningOrganizationId:org.id,code:key,title:"Enrolled Science",subject:"Science"}).returning());
    const version=first(await tx.insert(s.courseTemplateVersions).values({courseTemplateId:course.id,version:1,status:"published",curriculum:{learning:{version:1,modules:[{id:"intro",title:"Science introduction",lessons:[{id:"first",title:"First science lesson",body:"Read the science introduction and discuss your observations.",resources:[]}]}]}}}).returning());
    const section=first(await tx.insert(s.sections).values({programId:program.id,siteId:site.id,termId:time.term.id,
     courseTemplateVersionId:version.id,code:key,title:"Enrolled Science"}).returning());
    await tx.insert(s.sectionRegistrationPolicies).values({sectionId:section.id,enrollmentCapacity:1,
     addDropEndsOn:"2099-01-01",withdrawalEndsOn:"2099-02-01"});
    state.actor=staff;
    expect((await listEnrollmentPlacements({data:{applicationId}})).active).toBe(true);
    // An unstaffed Section shell must not satisfy the classroom handoff.
    await expect(placeEnrolledStudent({data:{applicationId,sectionId:section.id}}))
      .rejects.toThrow("Assign an active teacher");
    const classTeacher=first(await tx.insert(s.people).values({
      legalFirstName:"Assigned",legalLastName:"Instructor",
    }).returning());
    const teacherAccount=first(await tx.insert(s.accessAccounts).values({
      emailNormalized:`instructor-${suffix}@example.invalid`,
      emailVerifiedAt:new Date(),
    }).returning());
    await tx.insert(s.accountPersonGrants).values({
      accountId:teacherAccount.id,personId:classTeacher.id,role:"teacher",
      organizationId:org.id,siteId:site.id,
    });
    await tx.insert(s.sectionTeachers).values({sectionId:section.id,personId:classTeacher.id});
    await tx.insert(s.roleAssignments).values({
      personId:classTeacher.id,organizationId:org.id,siteId:site.id,
      programId:program.id,roleKey:"teacher",
    });
    const {enablePublishedPolicyInRollback}=await import("./helpers/published-policy");
    await enablePublishedPolicyInRollback(tx);
    const {createTeachingQualificationFixture}=await import("./helpers/teaching-qualification");
    const teacherQualification=await createTeachingQualificationFixture(tx,{
      sectionId:section.id,personId:classTeacher.id,verifierPersonId:registrar.id,
      issuedAt:new Date(Date.now()-86_400_000),
    });

    // The family-to-class preview and actual placement must agree on
    // verified sign-in status, not merely the existence of a staff row.
    await tx.update(s.accessAccounts).set({disabled:true})
      .where(eq(s.accessAccounts.id,teacherAccount.id));
    expect((await listEnrollmentPlacements({data:{applicationId}})).sections)
      .toEqual(expect.arrayContaining([expect.objectContaining({id:section.id,staffed:false,readyForPlacement:false})]));
    await expect(placeEnrolledStudent({data:{applicationId,sectionId:section.id}}))
      .rejects.toThrow("Assign an active teacher");
    await tx.update(s.accessAccounts).set({disabled:false})
      .where(eq(s.accessAccounts.id,teacherAccount.id));
    expect((await listEnrollmentPlacements({data:{applicationId}})).sections)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id:section.id,staffed:true,curriculumReady:true,readyForPlacement:true,
      })]));
    // Current account access cannot compensate for withdrawn qualification evidence.
    await tx.insert(s.qualificationVerificationEvents).values({
      claimId:teacherQualification.claimId,sequence:2,decision:"revoke",actorPersonId:registrar.id,
    });
    expect((await listEnrollmentPlacements({data:{applicationId}})).sections)
      .toEqual(expect.arrayContaining([expect.objectContaining({id:section.id,staffed:false,readyForPlacement:false})]));
    await expect(placeEnrolledStudent({data:{applicationId,sectionId:section.id}}))
      .rejects.toThrow("qualifications covering the instructional term");
    await tx.insert(s.qualificationVerificationEvents).values({
      claimId:teacherQualification.claimId,sequence:3,decision:"approve",actorPersonId:registrar.id,
    });
    // The same organization-wide registrar who issued the offer and
    // activated enrollment must be able to finish classroom placement.
    state.actor={...staff,scope:{organizationIds:[org.id]}};
    expect((await listEnrollmentPlacements({data:{applicationId}})).sections)
     .toEqual(expect.arrayContaining([expect.objectContaining({id:section.id,readyForPlacement:true})]));
    await placeEnrolledStudent({data:{applicationId,sectionId:section.id}});
    expect(await placeEnrolledStudent({data:{applicationId,sectionId:section.id}})).toMatchObject({created:false});
    state.actor={...staff,scope:{organizationIds:[org.id],siteIds:[crypto.randomUUID()]}};
    await expect(placeEnrolledStudent({data:{applicationId,sectionId:section.id}}))
     .rejects.toThrow("placement program scope");
    state.actor=staff;
    // Once the single-seat Section is occupied, the registrar must not
    // advertise an extra seat even while teacher + curriculum remain valid.
    expect((await listEnrollmentPlacements({data:{applicationId}})).sections)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id:section.id,enrolled:true,readyForPlacement:false,
      })]));
    // Same admitted learner, not a parallel synthetic attendance roster.
    // A published SchoolYear calendar and onsite schedule determine whether
    // the church expects the student on this particular date.
    state.actor=staff;
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2027-09-14T18:00:00Z"));
    try{
      state.actor={...staff,scope:{organizationIds:[org.id]}};
      const scheduled=await listExpectedOnsiteRoster({data:{date:"2027-09-14"}});
      expect(scheduled.students).toEqual(expect.arrayContaining([
        expect.objectContaining({studentProfileId:profileId,programId:program.id}),
      ]));
      const present=await markExpectedOnsiteAttendance({data:{
        studentProfileId:profileId,programId:program.id,date:"2027-09-14",
        status:"present",mutationId:crypto.randomUUID(),
        expectedPreviousEventId:null,note:"",
      }});
      expect(present.attendanceEventId).toBeTruthy();
      state.actor={...staff,scope:{organizationIds:[org.id],siteIds:[crypto.randomUUID()]}};
      await expect(listExpectedOnsiteRoster({data:{date:"2027-09-14"}}))
       .resolves.toMatchObject({students:[]});
      state.actor={...staff,scope:{organizationIds:[org.id]}};
      const recorded=await listExpectedOnsiteRoster({data:{date:"2027-09-14"}});
      expect(recorded.students).toEqual(expect.arrayContaining([
        expect.objectContaining({studentProfileId:profileId,status:"present"}),
      ]));
    }finally{vi.useRealTimers();}
    state.actor=learner;
    expect((await getMyStudentToday()).sections.map(row=>row.sectionId)).toEqual([section.id]);
    expect((await accessibleClasses(learner)).map(row=>row.id)).toEqual([section.id]);
    await authorizeClass(learner,section.id);
    const instructor=act("teacher",classTeacher.id);
    expect((await accessibleClasses(instructor)).map(row=>row.id)).toEqual([section.id]);
    await authorizeClass(instructor,section.id);
    // The same just-activated Section and student must be usable by BOTH
    // the newly placed learner and the teacher's gradebook, not only SIS.
    expect((await getGradebookSections()).sections.map(row=>row.id)).toContain(section.id);
    const gradebook=await getGradebook({data:{sectionId:section.id}});
    expect(gradebook.students.map(row=>row.studentProfileId)).toContain(profileId);
    const teacherClass=await getClassWorkspace({data:{sectionId:section.id}});
    expect(teacherClass.content?.modules[0]?.lessons[0]?.id).toBe("first");
    expect(teacherClass.roster.some(row=>row.profileId===profileId)).toBe(true);
    // Exercise today's grading queue with this same enrolled student.
    const pendingReview=first(await tx.insert(s.assessments).values({
      sectionId:section.id,title:"First lesson response",
      status:"published",pointsPossible:"10",
      instructions:"Write a response to the opening lesson.",
      createdByPersonId:classTeacher.id,
    }).returning());
    await tx.insert(s.submissions).values({
      assessmentId:pendingReview.id,studentProfileId:profileId,
      status:"submitted",response:{text:"My first lesson response."},
      submittedAt:new Date(),
    });
    const teacherToday=await getTeacherToday();
    expect(teacherToday.sections.find(row=>row.id===section.id)?.studentCount).toBe(1);
    expect(teacherToday.ungraded.some(row=>row.studentProfileId===profileId &&
      row.assessmentId===pendingReview.id)).toBe(true);
    // Teacher uses the real assessment command; the published assignment
    // belongs to the exact class and admitted student from this journey.
    const firstAssignment=await createAssessment({data:{
      sectionId:section.id,title:"First learning activity",
      instructions:"Write three sentences about the first lesson.",
      curriculumLessonId:"first",pointsPossible:10,
      dueAt:new Date(Date.now()+7*86400_000).toISOString(),
      publishNow:true,
    }});
    expect(firstAssignment.status).toBe("published");
    state.actor=learner;
    const studentClass=await getClassWorkspace({data:{sectionId:section.id}});
    expect(studentClass.content?.modules[0]?.lessons[0]?.id).toBe("first");
    // Last-mile P0: the same admitted child can receive a DIFFERENT verified
    // student account only after their guardian consents and staff approves.
    state.actor=family;
    const email=`learner-${suffix}@example.org`;
    // Never record an approved student login consent for an address to
    // which the passwordless issuer intentionally cannot send a link.
    await expect(consentToStudentLearningAccount({data:{
      applicationId,studentEmail:`learner-${suffix}@can-os.invalid`,acknowledged:true,
    }})).rejects.toThrow("deliverable student email");
    expect((await getStudentLearningHandoff({data:{applicationId}})).status)
      .toBe("not_requested");
    const [realSectionEnrollment]=await tx.select({id:s.enrollments.id})
      .from(s.enrollments).where(and(
        eq(s.enrollments.studentProfileId,profileId),
        eq(s.enrollments.kind,"section"),eq(s.enrollments.sectionId,section.id),
        eq(s.enrollments.status,"active"),
      ));
    if(!realSectionEnrollment)throw new Error("Missing Section enrollment fixture");
    await tx.update(s.enrollments).set({schoolYearId:null})
      .where(eq(s.enrollments.id,realSectionEnrollment.id));
    await expect(consentToStudentLearningAccount({data:{
      applicationId,studentEmail:email,acknowledged:true,
    }})).rejects.toThrow("actual ready classroom placement");
    await tx.update(s.enrollments).set({schoolYearId:time.schoolYear.id})
      .where(eq(s.enrollments.id,realSectionEnrollment.id));
    await consentToStudentLearningAccount({data:{
      applicationId,studentEmail:email,acknowledged:true,
    }});
    expect((await getStudentLearningHandoff({data:{applicationId}})).status)
      .toBe("pending_review");
    // The child's proposed email must be a DEDICATED learning login.
    // Existing same-person teacher/guardian membership would cause generic
    // passwordless redemption to choose the wrong first grant.
    const sharedEmail=`mixed-student-${suffix}@example.org`;
    const [sharedAccount]=await tx.insert(s.accessAccounts).values({
      emailNormalized:sharedEmail,emailVerifiedAt:new Date(),
    }).returning();
    await tx.insert(s.accountPersonGrants).values({
      accountId:sharedAccount!.id,personId:student.personId,
      role:"teacher",organizationId:org.id,siteId:site.id,
      active:true,isSynthetic:false,
    });
    // Synthetic fixtures with otherwise supported roles must not get a
    // genuine email challenge. The demo-code path remains separate.
    const [syntheticAccount]=await tx.insert(s.accessAccounts).values({
      emailNormalized:`synthetic-student-${suffix}@example.org`,
    }).returning();
    await tx.insert(s.accountPersonGrants).values({
      accountId:syntheticAccount!.id,personId:student.personId,
      role:"student",organizationId:org.id,siteId:site.id,
      active:true,isSynthetic:true,
    });
    const syntheticMail=vi.fn(async (_message:{to:string;accessUrl:string})=>{});
    await access.requestOneTimeAccess(
      `synthetic-student-${suffix}@example.org`,syntheticMail);
    expect(syntheticMail).not.toHaveBeenCalled();
    await consentToStudentLearningAccount({data:{
      applicationId,studentEmail:sharedEmail,acknowledged:true,
    }});
    state.actor=staff;
    await expect(provisionStudentLearningAccess({data:{
      applicationId,confirmedIndependentIdentity:true,
      reviewMethod:"institutional_school_record",
    }})).rejects.toThrow("student-only account");
    expect((await getStudentLearningHandoff({data:{applicationId}})).status)
      .toBe("pending_review");
    state.actor=family;
    await consentToStudentLearningAccount({data:{
      applicationId,studentEmail:email,acknowledged:true,
    }});
    state.actor=staff;
    state.studentInvite.mockClear();
    await expect(provisionStudentLearningAccess({data:{applicationId}}))
      .rejects.toThrow("independent student identity verification");
    expect(state.studentInvite).not.toHaveBeenCalled();
    expect(await provisionStudentLearningAccess({data:{
      applicationId,confirmedIndependentIdentity:true,
      reviewMethod:"institutional_school_record",
    }})).toMatchObject({status:"approved"});
    expect(state.studentInvite).toHaveBeenCalledOnce();
    expect(state.studentInvite).toHaveBeenCalledWith(email);
    expect(state.studentLink).toContain("/access/verify#token=");
    const approvalEvents=await tx.select({id:s.domainEvents.id}).from(s.domainEvents)
      .where(eq(s.domainEvents.eventType,"StudentLearningAccessApproved"));
    expect(approvalEvents).toHaveLength(1);
    // Email resend can be retried without creating another institutional
    // account approval event or changing the recorded reviewer decision.
    expect(await provisionStudentLearningAccess({data:{applicationId}}))
      .toMatchObject({status:"approved"});
    expect(state.studentInvite).toHaveBeenCalledTimes(2);
    // Registrar retry during cooldown cannot replace the initial student link.
    const originalLink=state.studentLink;
    expect(originalLink).toContain("/access/verify#token=");
    expect(await tx.select({id:s.domainEvents.id}).from(s.domainEvents)
      .where(eq(s.domainEvents.eventType,"StudentLearningAccessApproved")))
      .toHaveLength(1);
    const [studentAccount]=await tx.select().from(s.accessAccounts)
      .where(eq(s.accessAccounts.emailNormalized,email));
    if(!studentAccount)throw new Error("Student account was not provisioned");
    const [studentGrant]=await tx.select().from(s.accountPersonGrants)
      .where(and(eq(s.accountPersonGrants.accountId,studentAccount.id),
        eq(s.accountPersonGrants.personId,student.personId),
        eq(s.accountPersonGrants.role,"student")));
    expect(studentGrant).toMatchObject({
      active:true,isSynthetic:false,siteId:site.id,organizationId:org.id,
    });
    expect((await getStudentLearningHandoff({data:{applicationId}})).status)
      .toBe("approved");
    // The student's invitation generates a real passwordless challenge,
    // DB-backed role session and cookie for this exact enrolled Person.
    const token=new URL(originalLink).hash.slice("#token=".length);
    const redeemed=await access.redeemOneTimeAccess(token);
    expect(redeemed.role).toBe("student");
    expect(redeemed.accountId).toBe(studentAccount.id);
    await expect(access.redeemOneTimeAccess(token))
      .rejects.toThrow("Invalid or expired access link");
    const verifiedStudent=await sessionAuth.getCommandContext(
     new Request("https://app.can-os.com/student",{
      headers:{cookie:redeemed.setCookie.split(";")[0]!},
     }));
    expect(verifiedStudent).toMatchObject({
     role:"student",actorPersonId:student.personId,
     accountId:studentAccount.id,grantId:studentGrant!.id,grantSiteId:site.id,
    });
    expect(verifiedStudent.scope.programIds).toContain(program.id);
    state.actor=verifiedStudent as Actor;
    expect((await getMyStudentToday()).sections.map(row=>row.sectionId))
     .toContain(section.id);
    const signedInClass=await getClassWorkspace({data:{sectionId:section.id}});
    expect(signedInClass.content?.modules[0]?.lessons[0]?.id).toBe("first");
    // The ACTUAL passwordless-student persona sees the new teacher's
    // assessment, submits work, and receives feedback from that same teacher.
    const studentAssignments=await getAssignments();
    expect(studentAssignments.assignments.find(row=>
      row.assessmentId===firstAssignment.assessmentId)?.status).toBe("assigned");
    const response=await saveAssignmentResponse({data:{
      assessmentId:firstAssignment.assessmentId,
      text:"My first lesson showed me how to compare expressions.",
    }});
    expect(response.submissionId).toBeTruthy();
    expect((await getAssignments()).assignments.find(row=>
      row.assessmentId===firstAssignment.assessmentId)?.status).toBe("submitted");
    state.actor=instructor;
    const feedback=await gradeSubmission({data:{
      submissionId:response.submissionId,score:9,
      feedbackComment:"Good first response. Explain your comparison next time.",
    }});
    expect(feedback.submissionId).toBe(response.submissionId);
    state.actor=verifiedStudent as Actor;
    const returned=first((await getAssignments()).assignments.filter(row=>
      row.assessmentId===firstAssignment.assessmentId));
    expect(returned.status).toBe("graded");
    expect(Number(returned.score)).toBe(9);
    expect(returned.feedbackText).toContain("Explain your comparison");

    // P0 complete feedback loop: teacher returns a real graded attempt,
    // learner drafts and submits attempt 2, same teacher grades revision.
    state.actor=instructor;
    await manageAssessment({data:{assessmentId:firstAssignment.assessmentId,action:"close"}});
    await expect(returnSubmissionForRevision({data:{
      submissionId:response.submissionId,
    }})).rejects.toThrow("Reopen the published assessment");
    await manageAssessment({data:{assessmentId:firstAssignment.assessmentId,action:"reopen"}});
    await returnSubmissionForRevision({data:{submissionId:response.submissionId}});
    await expect(returnSubmissionForRevision({data:{
      submissionId:response.submissionId,
    }})).rejects.toThrow("Only graded work");
    state.actor=verifiedStudent as Actor;
    const returnedWork=first((await getAssignments()).assignments.filter(row=>
      row.assessmentId===firstAssignment.assessmentId));
    expect(returnedWork.status).toBe("returned");
    expect(returnedWork.feedbackText).toContain("Explain your comparison");
    await saveAssignmentDraft({data:{
      assessmentId:firstAssignment.assessmentId,
      text:"This revision compares the two expressions.",
    }});
    const drafting=first((await getAssignments()).assignments.filter(row=>
      row.assessmentId===firstAssignment.assessmentId));
    expect(drafting.status).toBe("assigned");
    expect(drafting.attemptNumber).toBe(2);
    expect(drafting.revisionFeedbackText).toContain("Explain your comparison");
    expect(drafting.revisionFeedbackSubmissionId).toBe(response.submissionId);
    expect(drafting.score).toBeNull();
    state.actor=family;
    expect((await getGuardianStudents()).students.map(row=>row.studentPersonId))
      .toContain(student.personId);
    const guardianDraft=first((await getGuardianAssignments({data:{
      studentPersonId:student.personId,
    }})).assignments.filter(row=>row.assessmentId===firstAssignment.assessmentId));
    expect(guardianDraft.status).toBe("assigned");
    expect(guardianDraft.score).toBeNull();
    expect(guardianDraft.feedback).toBe("");
    expect(guardianDraft.revisionFeedback).toContain("Explain your comparison");
    expect(guardianDraft.revisionFeedbackSubmissionId).toBe(response.submissionId);
    // Guardian sees already released feedback, NEVER the private saved draft.
    expect("responseText" in guardianDraft).toBe(false);
    state.actor=verifiedStudent as Actor;
    const revision=await saveAssignmentResponse({data:{
      assessmentId:firstAssignment.assessmentId,
      text:"This revision compares the two expressions by simplifying both sides.",
    }});
    expect(revision.submissionId).not.toBe(response.submissionId);
    expect(first((await getAssignments()).assignments.filter(row=>
      row.assessmentId===firstAssignment.assessmentId)).status).toBe("submitted");
    state.actor=instructor;
    await expect(returnSubmissionForRevision({data:{
      submissionId:response.submissionId,
    }})).rejects.toThrow("Only graded work");
    await gradeSubmission({data:{
      submissionId:revision.submissionId,score:10,
      feedbackComment:"Excellent revision. Comparison is now clearly explained.",
    }});
    state.actor=verifiedStudent as Actor;
    const revised=first((await getAssignments()).assignments.filter(row=>
      row.assessmentId===firstAssignment.assessmentId));
    expect(revised.status).toBe("graded");
    expect(Number(revised.score)).toBe(10);
    expect(revised.feedbackText).toContain("Excellent revision");
    expect(revised.revisionFeedbackText).toBe("");
    expect(revised.revisionFeedbackSubmissionId).toBeNull();
    expect(revised.attempts.map(a=>a.attempt).sort()).toEqual([1,2]);
    expect(revised.attempts.some(a=>a.attempt===1&&a.status==="returned")).toBe(true);
    state.actor=family;
    const guardianGrade=first((await getGuardianAssignments({data:{
      studentPersonId:student.personId,
    }})).assignments.filter(row=>row.assessmentId===firstAssignment.assessmentId));
    expect(guardianGrade.status).toBe("graded");
    expect(Number(guardianGrade.score)).toBe(10);
    expect(guardianGrade.feedback).toContain("Excellent revision");
    expect(guardianGrade.revisionFeedback).toBe("");
    expect((await getGuardianGradeResponse({data:{
      submissionId:revision.submissionId,
    }})).response).toBeNull();
    state.actor=learner;
    // A withdrawn Program must remove learning access even when a stale
    // active Section enrollment was left behind. Restore fixture state after
    // proving the deny so remaining enrollment/guardian assertions can run.
    const [activeProgram]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
      .where(and(eq(s.enrollments.studentProfileId,profileId),
        eq(s.enrollments.programId,program.id),
        eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
    if(!activeProgram)throw new Error("Expected current Program enrollment");
    await tx.update(s.enrollments).set({status:"withdrawn"})
      .where(eq(s.enrollments.id,activeProgram.id));
    state.actor=family;
    expect((await getGuardianStudents()).students.map(row=>row.studentPersonId))
      .not.toContain(student.personId);
    expect((await getGuardianAssignments({data:{
      studentPersonId:student.personId,
    }})).assignments).toEqual([]);
    await expect(getGuardianGradeResponse({data:{
      submissionId:revision.submissionId,
    }})).rejects.toThrow("related graded assignment");
    state.actor=learner;
    await expect(authorizeClass(learner,section.id)).rejects.toThrow("active class enrollment");
    expect((await accessibleClasses(learner)).map(row=>row.id)).not.toContain(section.id);
    await expect(getMyStudentToday()).rejects.toThrow("active student membership");
    expect((await getAssignments()).assignments.map(row=>row.assessmentId))
      .not.toContain(firstAssignment.assessmentId);
    await expect(saveAssignmentDraft({data:{
      assessmentId:firstAssignment.assessmentId,text:"Former student editing.",
    }})).rejects.toThrow("active class enrollment");
    await expect(createSubmissionAttachmentUpload({data:{
      assessmentId:firstAssignment.assessmentId,
      fileName:"orphan-section.pdf",contentType:"application/pdf",sizeBytes:1024,
    }})).rejects.toThrow("active class enrollment");
    expect((await listSubmissionAttachments({data:{
      assessmentId:firstAssignment.assessmentId,
    }})).attachments).toHaveLength(0);
    state.actor=instructor;
    await expect(returnSubmissionForRevision({data:{
      submissionId:revision.submissionId,
    }})).rejects.toThrow("active Program and Section enrollment");
    state.actor=learner;
    // The former child's class must also vanish from CURRENT teacher rosters
    // without deleting historical assessments or their audit trail.
    state.actor=instructor;
    expect((await getClassWorkspace({data:{sectionId:section.id}})).roster
      .some(row=>row.profileId===profileId)).toBe(false);
    expect((await getGradebook({data:{sectionId:section.id}})).students
      .some(row=>row.studentProfileId===profileId)).toBe(false);
    // An active orphan Section row must not receive newly published work
    // after the student's institutional Program membership is withdrawn.
    const withdrawnClasswork=await createAssessment({data:{
      sectionId:section.id,title:"New work after withdrawal",
      instructions:"A later lesson exercise.",curriculumLessonId:"first",
      pointsPossible:10,dueAt:new Date(Date.now()+7*86400_000).toISOString(),
      publishNow:true,
    }});
    expect(await tx.select({id:s.submissions.id}).from(s.submissions).where(and(
      eq(s.submissions.assessmentId,withdrawnClasswork.assessmentId),
      eq(s.submissions.studentProfileId,profileId),
    ))).toHaveLength(0);
    const withdrawnToday=await getTeacherToday();
    expect(withdrawnToday.sections.find(row=>row.id===section.id)?.studentCount).toBe(0);
    expect(withdrawnToday.ungraded.some(row=>row.studentProfileId===profileId)).toBe(false);
    state.actor=family;
    expect((await getFamilyHome()).children).toEqual([]);
    state.actor=learner;
    await tx.update(s.enrollments).set({status:"active"})
      .where(eq(s.enrollments.id,activeProgram.id));
    expect((await getMyStudentToday()).sections.map(row=>row.sectionId)).toContain(section.id);
    state.actor=instructor;
    expect((await getTeacherToday()).ungraded.some(row=>
      row.studentProfileId===profileId)).toBe(true);
    const unrelated=act("guardian",outsider.id);
    await expect(authorizeClass(unrelated,section.id,student.personId)).rejects.toThrow();
    state.actor=family;
    expect(first((await getFamilyHome()).children)).toMatchObject({studentProfileId:profileId,sectionCount:1,awaitingSections:false});
    expect(first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===current.offerId)?.progress.state).toBe("enrolled");
    expect(first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===issued.offerId)?.progress.state).toBe("revoked");
    await authorizeClass(family,section.id,student.personId);
    state.actor={...family,scope:{...family.scope,programIds:[]}};
    expect((await getFamilyHome()).children).toEqual([]);
    expect(await getGuardianAdmissionOffers({data:{}})).toEqual([]);
    state.actor=family;
    const notices=await getNotifications();
    expect(notices.some(row=>row.title==="Enrollment confirmed")).toBe(true);
    expect(notices.filter(row=>row.title==="Enrollment confirmed")).toHaveLength(1);
    expect(notices.filter(row=>row.title==="Enrollment offer withdrawn")).toHaveLength(1);
    // Needs You must apply the same CURRENT verified-guardian rule as the
    // notification center, including titles/bodies after revocation.
    expect((await getGuardianNeedsYou()).items.some(row=>
      row.kind==="notification"&&row.title==="Enrollment document requested")).toBe(true);
    await tx.update(s.guardianRelationships).set({
      canManageEnrollment:false,canViewAcademics:false,
    }).where(and(eq(s.guardianRelationships.guardianPersonId,guardian.id),
      eq(s.guardianRelationships.studentPersonId,student.personId)));
    expect((await getGuardianNeedsYou()).items.some(row=>
      row.title==="Enrollment document requested")).toBe(false);
    await tx.update(s.guardianRelationships).set({
      canManageEnrollment:true,canViewAcademics:true,
    }).where(and(eq(s.guardianRelationships.guardianPersonId,guardian.id),
      eq(s.guardianRelationships.studentPersonId,student.personId)));
    expect(notices.find(row=>row.title==="Enrollment offer withdrawn")?.href).toContain(`offer=${issued.offerId}`);
    expect(JSON.stringify(notices)).not.toContain(withdraw.reason);
    await tx.update(s.sections).set({active:false}).where(eq(s.sections.id,section.id));
    expect(first(await getGuardianAdmissionOffers({data:{}})).offers.find(offer=>offer.id===current.offerId)?.progress.state)
     .toBe("awaiting_classes");
    expect(first((await getFamilyHome()).children).awaitingSections).toBe(true);
    state.actor=learner;
    expect((await getMyStudentToday()).sections).toEqual([]);
    state.actor=staff;
    await expect(setFamilyRequirement({data:{applicationId,requirementId:requirement.id,complete:false}}))
     .rejects.toThrow("Journey cannot be edited");
    expect(await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,profileId),eq(s.enrollments.kind,"program")))).toHaveLength(1);
    expect(await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,profileId),eq(s.enrollments.kind,"section")))).toHaveLength(1);
    const persisted=first(await tx.select().from(s.applications).where(eq(s.applications.id,applicationId)));
    expect(persisted).toMatchObject({householdId:app.householdId,studentProfileId:profileId,stage:"accepted"});
    for(const id of [documentId,replaced.documentId]){
     expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,id),
      eq(s.domainEvents.eventType,"EnrollmentDocumentSubmitted")))).toHaveLength(1);
     expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,id),
      eq(s.auditEvents.action,"enrollment.document.upload")))).toHaveLength(1);
    }
    expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,requirement.id),
     eq(s.domainEvents.eventType,"EnrollmentDocumentReviewed")))).toHaveLength(3);
    for(const [id,event] of [[issued.offerId,"AdmissionOfferRevoked"],[current.offerId,"AdmissionOfferAccepted"],[enrollmentId,"EnrollmentActivated"]]){
     expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,id!),eq(s.domainEvents.eventType,event!)))).toHaveLength(1);
    }
    const audit=first(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,issued.offerId),
     eq(s.auditEvents.action,"admissions.offer.withdraw"))));
    expect(audit.after).toMatchObject({status:"revoked",reason:withdraw.reason});
    for(const [id,action] of [[issued.offerId,"admissions.offer.withdraw"],[enrollmentId,"admissions.offer.activate"]]){
     expect(await tx.select().from(s.auditEvents).where(and(
      eq(s.auditEvents.resourceId,id!),eq(s.auditEvents.action,action!)))).toHaveLength(1);
    }
    const intakeKey=`configured-intake-${suffix}`;
    await tx.insert(s.journeyDefinitions).values({key:intakeKey,version:"1",audience:"family",owningOrganizationId:org.id,
     title:"Program-specific signed enrollment",configuration:{requirements:[
      {key:"program-form",title:"Program form",blocking:true,enrollmentForm:configured.form}
     ]}});
    await tx.update(s.programs).set({metadata:{enrollmentJourneyDefinitionKey:intakeKey}}).where(eq(s.programs.id,program.id));
    for(const decision of ["withdraw","decline"] as const){
     const closed=await intake.createAdmissionsInquiry({data:{requestId:crypto.randomUUID(),programId:program.id,
      studentFirstName:"Exception",studentLastName:decision,guardianFirstName:"Exception",guardianLastName:"Guardian",
      guardianEmail:`admissions-${decision}-${suffix}@example.invalid`}});
     await intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision:"application"}});
     await intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision:"eligibility"}});
     await intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision:"waitlist"}});
     await intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision}});
     await expect(intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision}})).rejects.toThrow("not permitted");
     await expect(intake.transitionAdmissionsStage({data:{applicationId:closed.applicationId,decision:"restore"}})).rejects.toThrow("not permitted");
     await expect(offers.issueAdmissionOffer({data:{...issuance,applicationId:closed.applicationId}})).rejects.toThrow("not open");
     expect(first(await tx.select().from(s.applications).where(eq(s.applications.id,closed.applicationId))))
      .toMatchObject({stage:decision==="withdraw"?"withdrawn":"declined",metadata:{admissionsDisposition:null}});
     expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,closed.applicationId),
      eq(s.auditEvents.action,`admissions.stage.${decision}`)))).toHaveLength(1);
    }
    const inquiry=await intake.createAdmissionsInquiry({data:{requestId:crypto.randomUUID(),programId:program.id,
     studentFirstName:"Configured",studentLastName:"Applicant",guardianFirstName:"Configured",guardianLastName:"Guardian",
     guardianEmail:`configured-${suffix}@example.invalid`}});
    await intake.transitionAdmissionsStage({data:{applicationId:inquiry.applicationId,decision:"application"}});
    await intake.transitionAdmissionsStage({data:{applicationId:inquiry.applicationId,decision:"eligibility"}});
    const intakeJourney=first(await tx.select().from(s.journeys).where(eq(s.journeys.participantId,inquiry.applicationId)));
    expect(first(await tx.select().from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId,intakeJourney.id))))
     .toMatchObject({metadata:{enrollmentForm:{version:"approved-test-v1"}}});
    const returningPerson=first(await tx.insert(s.people).values({
     legalFirstName:"Existing",legalLastName:"Classmate",metadata:{synthetic:true},
    }).returning());
    const returningProfile=first(await tx.insert(s.studentProfiles).values({
     personId:returningPerson.id,gradeLevel:"10",metadata:{synthetic:true},
    }).returning());
    const returningHousehold=first(await tx.insert(s.households).values({displayName:"Existing household"}).returning());
    await tx.insert(s.householdMemberships).values([
     {householdId:returningHousehold.id,personId:returningPerson.id,relationshipLabel:"student"},
     {householdId:returningHousehold.id,personId:guardian.id,relationshipLabel:"guardian"},
    ]);
    await tx.insert(s.guardianRelationships).values({guardianPersonId:guardian.id,studentPersonId:returningPerson.id,relationshipLabel:"guardian",
     canManageEnrollment:true,metadata:{verification:"verified"}});
    const originalClassEnrollment=first(await tx.insert(s.enrollments).values({
     studentProfileId:returningProfile.id,organizationId:org.id,programId:program.id,
     kind:"section",status:"active",sectionId:section.id,schoolYearId:time.schoolYear.id,
    }).returning());
    const returningInput={requestId:crypto.randomUUID(),programId:program.id,
     existingStudent:{studentProfileId:returningProfile.id,guardianPersonId:guardian.id,householdId:returningHousehold.id}};
    const originalPeople=await tx.select({id:s.people.id}).from(s.people);
    const originalProfiles=await tx.select({id:s.studentProfiles.id}).from(s.studentProfiles);
    const originalHouseholds=await tx.select({id:s.households.id}).from(s.households);
    const originalRelations=await tx.select().from(s.guardianRelationships);
    const originalHouseholdMembers=await tx.select().from(s.householdMemberships);
    state.actor=family;
    await expect(intake.listAdmissionsExistingStudents()).rejects.toThrow("registrar");
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("registrar");
    state.actor={...staff,capabilities:new Set()};
    await expect(intake.listAdmissionsExistingStudents()).rejects.toThrow("enrollment.decide");
    state.actor={...staff,scope:{...staff.scope,siteIds:[]}};
    expect(await intake.listAdmissionsExistingStudents()).toEqual([]);
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("school and organization");
    state.actor={...staff,scope:{...staff.scope,organizationIds:[]}};
    expect(await intake.listAdmissionsExistingStudents()).toEqual([]);
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("school and organization");
    state.actor={...staff,scope:{...staff.scope,programIds:[crypto.randomUUID()]}};
    expect(await intake.listAdmissionsExistingStudents()).toEqual([]);
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("admissions program");
    state.actor=staff;
    expect(await intake.listAdmissionsExistingStudents()).toContainEqual(expect.objectContaining({
     studentProfileId:returningProfile.id,householdId:returningHousehold.id,guardianPersonId:guardian.id,
    }));
    await expect(intake.createAdmissionsInquiry({data:{...returningInput,
     existingStudent:{...returningInput.existingStudent,guardianPersonId:outsider.id}}})).rejects.toThrow("household scope");
    await expect(intake.createAdmissionsInquiry({data:{...returningInput,existingApplicationId:inquiry.applicationId}}))
     .rejects.toThrow();
    await expect(intake.createAdmissionsInquiry({data:{...returningInput,studentFirstName:"Overwrite"}})).rejects.toThrow();
    await tx.update(s.guardianRelationships).set({canManageEnrollment:false})
     .where(eq(s.guardianRelationships.studentPersonId,returningPerson.id));
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("household scope");
    await tx.update(s.guardianRelationships).set({canManageEnrollment:true})
     .where(eq(s.guardianRelationships.studentPersonId,returningPerson.id));
    await tx.update(s.householdMemberships).set({personId:outsider.id}).where(and(
     eq(s.householdMemberships.householdId,returningHousehold.id),eq(s.householdMemberships.personId,guardian.id)));
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("household scope");
    await tx.update(s.householdMemberships).set({personId:guardian.id}).where(and(
     eq(s.householdMemberships.householdId,returningHousehold.id),eq(s.householdMemberships.personId,outsider.id)));
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED","false");
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("Synthetic writes are disabled");
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED","true");
    state.failInquiryEvent=true;
    await expect(intake.createAdmissionsInquiry({data:returningInput})).rejects.toThrow("inquiry outbox failure");
    state.failInquiryEvent=false;
    expect(await tx.select().from(s.applications).where(eq(s.applications.idempotencyKey,
     "registrar-inquiry:"+returningInput.requestId))).toEqual([]);
    const returning=await intake.createAdmissionsInquiry({data:returningInput});
    expect(await intake.createAdmissionsInquiry({data:returningInput})).toEqual(returning);
    await expect(intake.createAdmissionsInquiry({data:{...returningInput,requestId:crypto.randomUUID()}}))
     .rejects.toThrow("already has an open application");
    expect(first(await tx.select().from(s.applications).where(eq(s.applications.id,returning.applicationId))))
     .toMatchObject({studentProfileId:returningProfile.id,householdId:returningHousehold.id,stage:"inquiry",
      metadata:{synthetic:true,existingStudent:true,contactPersonId:guardian.id}});
    expect(await tx.select({id:s.people.id}).from(s.people)).toEqual(originalPeople);
    expect(await tx.select({id:s.studentProfiles.id}).from(s.studentProfiles)).toEqual(originalProfiles);
    expect(await tx.select({id:s.households.id}).from(s.households)).toEqual(originalHouseholds);
    expect((await tx.select().from(s.guardianRelationships)).map(({updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id)))
     .toEqual(originalRelations.map(({updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id)));
    expect((await tx.select().from(s.householdMemberships)).map(({updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id)))
     .toEqual(originalHouseholdMembers.map(({updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id)));
    expect(first(await tx.select().from(s.enrollments).where(eq(s.enrollments.id,originalClassEnrollment.id))))
     .toEqual(originalClassEnrollment);
    expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,returning.applicationId),
     eq(s.domainEvents.eventType,"AdmissionsInquiryCreated")))).toHaveLength(1);
    expect(first(await tx.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,returning.applicationId))))
     .toMatchObject({action:"admissions.inquiry.create",after:{studentProfileId:returningProfile.id,
      householdId:returningHousehold.id,guardianPersonId:guardian.id,existingStudent:true}});
    const returningKey=`existing-intake-${suffix}`;
    await tx.insert(s.journeyDefinitions).values({key:returningKey,version:"1",audience:"family",owningOrganizationId:org.id,
     title:"Existing student readiness",configuration:{requirements:[
      {key:"review",title:"Registrar review",blocking:true,owner:"can"},
     ]}});
    await tx.update(s.programs).set({metadata:{enrollmentJourneyDefinitionKey:returningKey}}).where(eq(s.programs.id,program.id));
    await intake.transitionAdmissionsStage({data:{applicationId:returning.applicationId,decision:"application"}});
    await intake.transitionAdmissionsStage({data:{applicationId:returning.applicationId,decision:"eligibility"}});
    await expect(intake.transitionAdmissionsStage({data:{applicationId:returning.applicationId,decision:"accept"}}))
     .rejects.toThrow("Complete blocking enrollment requirements");
    const returningJourney=first(await tx.select().from(s.journeys).where(eq(s.journeys.participantId,returning.applicationId)));
    const returningRequirement=first(await tx.select().from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId,returningJourney.id)));
    await setFamilyRequirement({data:{applicationId:returning.applicationId,requirementId:returningRequirement.id,complete:true}});
    await intake.transitionAdmissionsStage({data:{applicationId:returning.applicationId,decision:"accept"}});
    await tx.update(s.admissionSeatPools).set({capacity:2}).where(eq(s.admissionSeatPools.programId,program.id));
    const returningOffer=await offers.issueAdmissionOffer({data:{applicationId:returning.applicationId,schoolYearId:time.schoolYear.id}});
    await expect(offers.activateOfferedEnrollment({data:returningOffer})).rejects.toThrow("Guardian must accept");
    state.actor=family;
    await offers.respondToAdmissionOffer({data:{...returningOffer,decision:"accept"}});
    state.actor=staff;
    const returningEnrollment=await offers.activateOfferedEnrollment({data:returningOffer});
    expect(await offers.activateOfferedEnrollment({data:returningOffer})).toEqual(returningEnrollment);
    expect(first(await tx.select().from(s.enrollments).where(eq(s.enrollments.id,returningEnrollment.enrollmentId))))
     .toMatchObject({studentProfileId:returningProfile.id,programId:program.id,kind:"program",status:"active"});
    expect(await tx.select().from(s.enrollments).where(eq(s.enrollments.studentProfileId,returningProfile.id))).toHaveLength(2);
    expect(first(await tx.select().from(s.enrollments).where(eq(s.enrollments.id,originalClassEnrollment.id))))
     .toEqual(originalClassEnrollment);
    const unlinkedGuardian=first(await tx.insert(s.people).values({
     legalFirstName:"Unlinked",legalLastName:"Guardian",
    }).returning());
    const unlinkedPerson=first(await tx.insert(s.people).values({
     legalFirstName:"Unlinked",legalLastName:"Student",
    }).returning());
    const unlinkedProfile=first(await tx.insert(s.studentProfiles).values({personId:unlinkedPerson.id}).returning());
    await tx.insert(s.guardianRelationships).values({guardianPersonId:unlinkedGuardian.id,studentPersonId:unlinkedPerson.id,
     relationshipLabel:"guardian",canManageEnrollment:true});
    await tx.insert(s.enrollments).values({studentProfileId:unlinkedProfile.id,organizationId:org.id,
     programId:program.id,kind:"section",status:"active",sectionId:section.id,schoolYearId:time.schoolYear.id});
    const unlinkedInput={requestId:crypto.randomUUID(),programId:program.id,
     existingStudent:{studentProfileId:unlinkedProfile.id,guardianPersonId:unlinkedGuardian.id,createHousehold:true as const}};
    expect(await intake.listAdmissionsExistingStudents()).toContainEqual(expect.objectContaining({
     studentProfileId:unlinkedProfile.id,guardianPersonId:unlinkedGuardian.id,householdId:null,
    }));
    await expect(intake.createAdmissionsInquiry({data:{...unlinkedInput,existingStudent:{
     studentProfileId:unlinkedProfile.id,guardianPersonId:unlinkedGuardian.id,
    }}})).rejects.toThrow("explicitly confirm");
    await expect(intake.createAdmissionsInquiry({data:{...unlinkedInput,existingStudent:{
     ...unlinkedInput.existingStudent,householdId:returningHousehold.id,
    }}})).rejects.toThrow("explicitly confirm");
    const householdCountBefore=await tx.select({id:s.households.id}).from(s.households);
    state.failInquiryEvent=true;
    vi.stubEnv("CAN_DEMO_WRITES_ENABLED","false");
    await expect(intake.createAdmissionsInquiry({data:unlinkedInput})).rejects.toThrow("inquiry outbox failure");
    state.failInquiryEvent=false;
    expect(await tx.select({id:s.households.id}).from(s.households)).toEqual(householdCountBefore);
    expect(await tx.select().from(s.householdMemberships).where(eq(s.householdMemberships.personId,unlinkedPerson.id)))
     .toEqual([]);
    const unlinkedInquiry=await intake.createAdmissionsInquiry({data:unlinkedInput});
    expect(await intake.createAdmissionsInquiry({data:unlinkedInput})).toEqual(unlinkedInquiry);
    const unlinkedApplication=first(await tx.select().from(s.applications).where(eq(s.applications.id,unlinkedInquiry.applicationId)));
    expect(unlinkedApplication).toMatchObject({studentProfileId:unlinkedProfile.id,
     metadata:{existingStudent:true,synthetic:false,createdHousehold:true,contactPersonId:unlinkedGuardian.id}});
    expect(await tx.select().from(s.householdMemberships).where(eq(s.householdMemberships.householdId,unlinkedApplication.householdId)))
     .toHaveLength(2);
    expect(first(await tx.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,unlinkedInquiry.applicationId))))
     .toMatchObject({after:{createdHousehold:true,householdId:unlinkedApplication.householdId}});
    await expect(intake.createAdmissionsInquiry({data:{...unlinkedInput,requestId:returningInput.requestId}}))
     .rejects.toThrow("reused for another student");
    await expect(intake.createAdmissionsInquiry({data:{...unlinkedInput,requestId:crypto.randomUUID()}}))
     .rejects.toThrow("already has an open application");
    checked=true;throw rollback;
   });
  }catch(error){if(error!==rollback)throw error;}
  finally{state.tx=undefined;state.actor=undefined;state.failDocumentEvent=false;state.failStageEvent=false;state.failInquiryEvent=false;state.studentInvite.mockReset();state.studentLink="";vi.unstubAllEnvs();}
  expect(checked).toBe(true);
  expect(await database.select().from(s.applications).where(eq(s.applications.id,applicationId))).toEqual([]);
  expect(await database.select().from(s.studentProfiles).where(eq(s.studentProfiles.id,profileId))).toEqual([]);
  expect(await database.select().from(s.enrollments).where(eq(s.enrollments.id,enrollmentId))).toEqual([]);
  expect(await database.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,withdrawnOfferId))).toEqual([]);
  expect(await database.select().from(s.documents).where(eq(s.documents.id,documentId))).toEqual([]);
  expect(await database.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,documentId))).toEqual([]);
  expect(await database.select().from(s.journeyRequirements).where(eq(s.journeyRequirements.id,formRequirementId))).toEqual([]);
  expect(await database.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,formRequirementId))).toEqual([]);
 },180_000);
});
