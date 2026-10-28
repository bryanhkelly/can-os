import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { activateSectionEnrollment } from "@/modules/enrollment/section-allocation.service";
import { actorSiteIds,assertProgramGranted,recordAudit,requireActor,type Actor } from "@/modules/identity/actors.server";
import { emitEvent,notify,notifyMany,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,isNull,sql } from "drizzle-orm";
import { z } from "zod";
import { resolveCourseGuardianConsent } from "./course-guardian-consent";
import { getSectionRegistrationPolicy } from "./section-registration-policy-service";

import { EventTypes } from "@/domain/event-types";
async function studentProfileFor(actor: Actor) {
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const [profile] = await db.select({ id: s.studentProfiles.id }).from(s.studentProfiles).where(eq(s.studentProfiles.personId, actor.actorPersonId)).limit(1);
 if (!profile) throw new AuthorizationError("student profile");
 return profile.id;
}
/** Authorized student requests and scoped registrar decisions use canonical enrollment records. */
export const getCourseRegistration = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["student", "registrar"]);
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  const programIds = actor.scope.programIds ?? [];
  const viewerRole = actor.role as "student" | "registrar";
  if (!process.env.DATABASE_URL || !programIds.length) return { connected: !!process.env.DATABASE_URL, viewerRole, sections: [], requests: [] };
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const studentId = viewerRole === "student" ? await studentProfileFor(actor) : null;
  const [catalog, memberships, requests] = await Promise.all([
    db.select({ id:s.sections.id, title:s.sections.title, code:s.sections.code, metadata:s.sections.metadata,
      templateId:s.courseTemplates.id, subject:s.courseTemplates.subject, description:s.courseTemplates.description,
      termStartsOn:s.terms.startsOn,termEndsOn:s.terms.endsOn,
    }).from(s.sections)
      .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
      .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
      .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
      .where(and(inArray(s.sections.siteId,sites),inArray(s.sections.programId,programIds),eq(s.sections.active,true))),
    studentId ? db.select({ id:s.enrollments.id, sectionId:s.enrollments.sectionId, status:s.enrollments.status, metadata:s.enrollments.metadata })
      .from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.kind,"section"),inArray(s.enrollments.programId,programIds))).orderBy(desc(s.enrollments.createdAt)) : Promise.resolve([]),
    db.select({ id:s.actions.id, title:s.actions.title, status:s.actions.status, subjectId:s.actions.subjectId, metadata:s.actions.metadata })
      .from(s.actions).where(and(eq(s.actions.type,"course_registration_request"),inArray(s.actions.programId,programIds),
        viewerRole === "student" ? eq(s.actions.ownerPersonId,actor.actorPersonId) : inArray(s.actions.siteId,sites))),
  ]);
  const latest = new Map<string,(typeof memberships)[number]>();
  const teachers=catalog.length?await db.select({sectionId:s.sectionTeachers.sectionId,personId:s.people.id,
    firstName:s.people.legalFirstName,lastName:s.people.legalLastName,preferredName:s.people.preferredName})
    .from(s.sectionTeachers).innerJoin(s.people,eq(s.people.id,s.sectionTeachers.personId))
    .where(inArray(s.sectionTeachers.sectionId,catalog.map(course=>course.id))):[];
  for (const membership of memberships) if (membership.sectionId && !latest.has(membership.sectionId)) latest.set(membership.sectionId,membership);
  const sectionsWithPolicy=await Promise.all(catalog.map(async course=>{
    const policy=await getSectionRegistrationPolicy(course.id);
    return {
      id:course.id,title:course.title,code:course.code,subject:course.subject,description:course.description,
      teachers:teachers.filter(teacher=>teacher.sectionId===course.id).map(teacher=>({
        personId:teacher.personId,name:`${teacher.preferredName??teacher.firstName} ${teacher.lastName}`,
      })),
      credits:policy.credits,
      mode:typeof course.metadata.deliveryMode==="string"?course.metadata.deliveryMode:"hybrid",
      policy:{capacity:policy.enrollmentCapacity,prerequisites:policy.prerequisites,
       addDropEndsOn:policy.addDropEndsOn,withdrawalEndsOn:policy.withdrawalEndsOn,guardianApprovalRequired:policy.guardianApprovalRequired,meetingKey:null},
      enrollmentId:latest.get(course.id)?.id??null,
      enrollmentStatus:latest.get(course.id)?.status??null,
      withdrawalNotation:latest.get(course.id)?.metadata.withdrawalNotation??null,
    };
  }));
  return {
    connected:true,
    viewerRole,
    sections:sectionsWithPolicy,
    requests:requests.map(r=>({id:r.id,sectionId:r.subjectId,status:r.status,operation:r.metadata.operation??"add",title:r.title})),
  };
});

export const requestCourseChange = createServerFn({ method:"POST" })
  .validator((value:unknown)=>z.object({sectionId:z.string().uuid(),operation:z.enum(["add","drop","withdraw"])}).parse(value))
  .handler(async({data})=>{
    const actor=await requireActor(["student"]);
    const sites=actorSiteIds(actor);
    if (!process.env.DATABASE_URL) throw new Error("Neon not configured");
    const studentId=await studentProfileFor(actor);
    const [{ db },s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [section]=await tx.select({id:s.sections.id,title:s.sections.title,metadata:s.sections.metadata,programId:s.sections.programId,siteId:s.sections.siteId,schoolYearId:s.terms.schoolYearId,organizationId:s.programs.organizationId,termStartsOn:s.terms.startsOn,termEndsOn:s.terms.endsOn})
        .from(s.sections).innerJoin(s.terms,eq(s.terms.id,s.sections.termId)).innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
        .where(and(eq(s.sections.id,data.sectionId),inArray(s.sections.siteId,sites),eq(s.sections.active,true))).limit(1);
      if(!section) throw new Error("Section not offered at this Site");
      assertProgramGranted(actor,section.programId);
      const [programMembership]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
       .where(and(eq(s.enrollments.studentProfileId,studentId),
        eq(s.enrollments.programId,section.programId),
        eq(s.enrollments.schoolYearId,section.schoolYearId),
        eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"))).limit(1);
      if(!programMembership)throw new Error("Student must have an active enrollment in this school year and program");
      const policy=await getSectionRegistrationPolicy(section.id,tx);
      const today=new Date().toISOString().slice(0,10);
      if(data.operation==="drop" && today>policy.addDropEndsOn) throw new Error("Add/drop window has closed. Request withdrawal instead.");
      if(data.operation==="withdraw" && today>policy.withdrawalEndsOn) throw new Error("Withdrawal window has closed.");
      if(data.operation==="add" && today>policy.addDropEndsOn) throw new Error("Registration window has closed.");
      const guardianDecisionRequired=data.operation==="add"&&policy.guardianApprovalRequired;
      const guardians=guardianDecisionRequired?await tx.select({personId:s.guardianRelationships.guardianPersonId})
        .from(s.guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonId: actor.actorPersonId, access: "enrollment",
        })) : [];
      if(guardianDecisionRequired&&!guardians.length)
        throw new Error("This class requires a connected guardian with enrollment approval permission.");
      const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.sectionId,section.id),eq(s.enrollments.status,"active"))).limit(1);
      if(data.operation==="add" && membership) throw new Error("Already enrolled in this class");
      if(data.operation!=="add" && !membership) throw new Error("Not currently enrolled in this class");
      // Serialize concurrent requests for the same student and section before
      // looking for pending Actions; no new schema/unique constraint required.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"course-registration:"+studentId+":"+section.id}))`);
      const outstanding=await tx.select().from(s.actions).where(and(
        eq(s.actions.type,"course_registration_request"),eq(s.actions.ownerPersonId,actor.actorPersonId),
        eq(s.actions.subjectId,section.id),inArray(s.actions.status,["open","in_progress","waiting"])));
      if(outstanding.length) throw new Error("An enrollment change is already pending for this class");
      const [request]=await tx.insert(s.actions).values({
        type:"course_registration_request",status:"open",priority:"normal",
        title:`${data.operation==="add"?"Add":data.operation==="drop"?"Drop":"Withdraw from"} ${section.title}`,
        description:data.operation==="withdraw"?"Withdrawal requires review of transcript consequences.":"Requested by the student.",
        ownerPersonId:actor.actorPersonId,organizationId:section.organizationId,siteId:section.siteId,programId:section.programId,subjectType:"section",subjectId:section.id,
        metadata:{operation:data.operation,studentProfileId:studentId,schoolYearId:section.schoolYearId,enrollmentId:membership?.id??null,requestOrigin:"student",guardianConsentRequired:guardianDecisionRequired},
      }).returning({id:s.actions.id});
      if(!request)throw new Error("Unable to create course request");
      if(guardianDecisionRequired){
        const recipients=[...new Set(guardians.map(g=>g.personId))];
        await notifyMany(tx, recipients.map(recipientPersonId=>({
          recipientPersonId,status:"unread" as const,type:"course_registration_guardian_review",
          title:"Course addition needs your approval",
          body:"Your student requested a class that requires guardian permission.",
          resourceType:"action",resourceId:request.id,
        })));
      }
      await recordAudit(tx,actor,{action:"course_registration.request",resourceType:"action",resourceId:request.id,after:{operation:data.operation,sectionId:section.id},scope:{programId:section.programId,siteId:section.siteId}});
      await emitEvent(tx, {eventType:EventTypes.CourseRegistrationRequested,aggregateType:"action",aggregateId:request.id,actorPersonId:actor.actorPersonId,payload:{studentProfileId:studentId,sectionId:section.id,programId:section.programId,operation:data.operation}});
      return {requestId:request.id};
    });
  });

export const decideCourseChange = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({requestId:z.string().uuid(),approve:z.boolean()}).parse(value))
  .handler(async({data})=>{
    const actor=await requireActor(["registrar"],"registrations:approve");
    const sites=actorSiteIds(actor);
    if(!process.env.DATABASE_URL)throw new Error("Neon not configured");
    const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [request]=await tx.select().from(s.actions).where(and(
        eq(s.actions.id,data.requestId),eq(s.actions.type,"course_registration_request"),
        eq(s.actions.status,"open"))).limit(1).for("update");
      if(!request)throw new Error("Pending course request not found");
      if(!request.ownerPersonId||!request.organizationId||!request.siteId||!request.programId||
         request.subjectType!=="section"||!request.subjectId)throw new Error("Invalid course request context");
      assertProgramGranted(actor,request.programId);
      if(!sites.includes(request.siteId)||!actor.scope.organizationIds?.includes(request.organizationId))
        throw new AuthorizationError("course request site/organization scope");
      const studentProfileId=typeof request.metadata.studentProfileId==="string"?request.metadata.studentProfileId:"";
      const schoolYearId=typeof request.metadata.schoolYearId==="string"?request.metadata.schoolYearId:"";
      const programId=request.programId,organizationId=request.organizationId,siteId=request.siteId;
      const operation=request.metadata.operation;
      const sectionId=request.subjectId;
      if(!studentProfileId||!schoolYearId||!["add","drop","withdraw"].includes(String(operation)))
        throw new Error("Invalid course request payload");
      // An Action is not enrollment authority: revalidate its student owner and
      // academic scope before acting on metadata, including older fixture requests.
      const [requestStudent]=await tx.select({personId:s.studentProfiles.personId})
        .from(s.studentProfiles).where(eq(s.studentProfiles.id,studentProfileId)).limit(1);
      if(!requestStudent||requestStudent.personId!==request.ownerPersonId)
        throw new AuthorizationError("course request student ownership");
      // Even a drop/withdraw can remove a student's live onsite teaching
      // roster. Lock before the section FOR UPDATE and enrollment status edit.
      if(data.approve)await lockAttendanceConfigurationAtSite(tx,siteId);
      if(data.approve){
        const [section]=await tx.select({id:s.sections.id,termId:s.sections.termId,title:s.sections.title,
          schoolYearId:s.terms.schoolYearId,organizationId:s.programs.organizationId})
          .from(s.sections).innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
          .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
          .where(and(eq(s.sections.id,sectionId),eq(s.sections.siteId,siteId),
            eq(s.sections.programId,programId),eq(s.sections.active,true))).limit(1).for("update");
        if(!section||section.schoolYearId!==schoolYearId||section.organizationId!==organizationId)
          throw new Error("Course request no longer matches its school, program and academic year");
        const [activeProgram]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
         .where(and(eq(s.enrollments.studentProfileId,studentProfileId),
          eq(s.enrollments.programId,programId),eq(s.enrollments.schoolYearId,schoolYearId),
          eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"))).limit(1);
        if(!activeProgram)throw new Error("Student program enrollment is no longer active");
        const policyAtApproval=await getSectionRegistrationPolicy(section.id,tx);
        const today=new Date().toISOString().slice(0,10);
        if(operation==="add" && policyAtApproval.guardianApprovalRequired){
          const eligibleGuardians=await tx.select({personId:s.guardianRelationships.guardianPersonId})
            .from(s.guardianRelationships).where(guardianRelationshipPredicate({
              studentPersonId: request.ownerPersonId, access: "enrollment",
            }));
          const consentRows=await tx.select({
            signerPersonId:s.consentRecords.signerPersonId,evidence:s.consentRecords.signatureEvidence,
          }).from(s.consentRecords).where(and(
            eq(s.consentRecords.subjectType,"course_registration_request"),
            eq(s.consentRecords.subjectId,request.id),
            eq(s.consentRecords.consentType,"course_registration_add_decision"),
            eq(s.consentRecords.version,"course-registration/v1"),
            isNull(s.consentRecords.revokedAt),
          )).orderBy(desc(s.consentRecords.signedAt),desc(s.consentRecords.createdAt));
          const consentState=resolveCourseGuardianConsent({
            eligibleGuardianPersonIds:eligibleGuardians.map(g=>g.personId),
            decisionsNewestFirst:consentRows,
            studentProfileId,sectionId:section.id,schoolYearId,
          });
          if(consentState==="declined")
            throw new Error("A guardian declined this course addition.");
          if(consentState!=="approved")
            throw new Error("Guardian approval is pending for this course addition.");
        }
        if(operation==="add" && today>policyAtApproval.addDropEndsOn)throw new Error("Registration window closed before approval");
        if(operation==="drop" && today>policyAtApproval.addDropEndsOn)throw new Error("Drop deadline passed; submit withdrawal request");
        if(operation==="withdraw" && today>policyAtApproval.withdrawalEndsOn)throw new Error("Withdrawal deadline passed");
        if(operation==="add"){
          await activateSectionEnrollment(tx,{studentProfileId,sectionId,actor,source:"course_registration",requestId:request.id});
        } else {
          const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentProfileId),eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"))).limit(1);
          if(!membership)throw new Error("Enrollment no longer active");
          await tx.update(s.enrollments).set({status:operation==="drop"?"cancelled":"withdrawn",endedAt:new Date(),updatedAt:new Date(),
            metadata:{...membership.metadata,withdrawalNotation:operation==="withdraw"?"W":null,changeRequestId:request.id}
          }).where(eq(s.enrollments.id,membership.id));
          await emitEvent(tx, {eventType:operation==="drop"?EventTypes.SectionEnrollmentDropped:EventTypes.SectionEnrollmentWithdrawn,
            aggregateType:"enrollment",aggregateId:membership.id,actorPersonId:actor.actorPersonId,
            payload:{studentProfileId,sectionId,programId,schoolYearId,transcriptNotation:operation==="withdraw"?"W":null}});
          await writeAudit(tx, {actorPersonId:actor.actorPersonId,
            action:"course_registration.section."+operation,resourceType:"enrollment",
            resourceId:membership.id,scope:{siteId,programId},
            before:{status:membership.status},after:{status:operation==="drop"?"cancelled":"withdrawn"}});
        }
      }
      await tx.update(s.actions).set({status:data.approve?"resolved":"cancelled",resolvedAt:new Date(),
        resolutionNote:data.approve?"Approved enrollment change":"Declined enrollment change",updatedAt:new Date()}).where(eq(s.actions.id,request.id));
      if(request.ownerPersonId)await notify(tx, {recipientPersonId:request.ownerPersonId,type:"course_registration_decision",status:"unread",
        title:data.approve?"Your class change was approved":"Your class change was declined",body:request.title,resourceType:"action",resourceId:request.id});
      if(data.approve){
       const [student]=await tx.select({personId:s.studentProfiles.personId})
        .from(s.studentProfiles).where(eq(s.studentProfiles.id,studentProfileId)).limit(1);
       if(student){
        const guardians=await tx.select({personId:s.guardianRelationships.guardianPersonId})
         .from(s.guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonId: student.personId, access: "academic",
         }));
        if(guardians.length)await notifyMany(tx, guardians.map(g=>({recipientPersonId:g.personId,
          type:"course_registration_decision",status:"unread" as const,
          title:"Course schedule updated",
          body:request.title+" was approved by the school.",
          resourceType:"action",resourceId:request.id})));
       }
      }
      await recordAudit(tx,actor,{action:data.approve?"course_registration.approve":"course_registration.decline",resourceType:"action",resourceId:request.id,before:{status:"open"},after:{status:data.approve?"resolved":"cancelled",operation:String(operation)},scope:{programId,siteId}});
      await emitEvent(tx, {eventType:EventTypes.CourseRegistrationDecided,aggregateType:"action",aggregateId:request.id,actorPersonId:actor.actorPersonId,payload:{studentProfileId,sectionId,programId,operation,approved:data.approve}});
      return {approved:data.approve};
    });
  });
