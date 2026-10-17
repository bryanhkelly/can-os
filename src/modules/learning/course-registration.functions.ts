import { assertSyntheticMutation } from "@/modules/_demo/demo-write-gate";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, assertProgramGranted, recordAudit, requireActor, type Actor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";

async function studentProfileFor(actor: Actor) {
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const [profile] = await db.select({ id: s.studentProfiles.id }).from(s.studentProfiles).where(eq(s.studentProfiles.personId, actor.actorPersonId)).limit(1);
 if (!profile) throw new AuthorizationError("student profile");
 return profile.id;
}
function registrationPolicy(meta: Record<string, unknown>) {
 const raw=meta.registrationPolicy;
 const p=raw && typeof raw==="object" && !Array.isArray(raw) ? raw as Record<string,unknown> : {};
 return {
  capacity: typeof p.capacity==="number" ? p.capacity : 30,
  prerequisites: Array.isArray(p.prerequisites) ? p.prerequisites.filter((v):v is string=>typeof v==="string") : [],
  addDropEndsOn:typeof p.addDropEndsOn==="string" ? p.addDropEndsOn : "2026-10-31",
  withdrawalEndsOn:typeof p.withdrawalEndsOn==="string" ? p.withdrawalEndsOn : "2026-12-15",
  meetingKey:typeof p.meetingKey==="string" ? p.meetingKey : null,
 };
}

/** Student/guardian course registration prototype for the synthetic tenant only. */
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
    }).from(s.sections)
      .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
      .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
      .where(and(inArray(s.sections.siteId,sites),inArray(s.sections.programId,programIds),eq(s.sections.active,true))),
    studentId ? db.select({ id:s.enrollments.id, sectionId:s.enrollments.sectionId, status:s.enrollments.status, metadata:s.enrollments.metadata })
      .from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.kind,"section"),inArray(s.enrollments.programId,programIds))) : Promise.resolve([]),
    db.select({ id:s.actions.id, title:s.actions.title, status:s.actions.status, subjectId:s.actions.subjectId, metadata:s.actions.metadata })
      .from(s.actions).where(and(eq(s.actions.type,"course_registration_request"),inArray(s.actions.programId,programIds),
        viewerRole === "student" ? eq(s.actions.ownerPersonId,actor.actorPersonId) : inArray(s.actions.siteId,sites))),
  ]);
  const latest = new Map<string,(typeof memberships)[number]>();
  for (const membership of memberships) if (membership.sectionId) latest.set(membership.sectionId,membership);
  return {
    connected:true,
    viewerRole,
    sections:catalog.map(c=>({
      id:c.id,title:c.title,code:c.code,subject:c.subject,description:c.description,
      credits:typeof c.metadata.credits==="number"?c.metadata.credits:1,
      mode:typeof c.metadata.deliveryMode==="string"?c.metadata.deliveryMode:"hybrid",
      policy:registrationPolicy(c.metadata),
      enrollmentId:latest.get(c.id)?.id??null,
      enrollmentStatus:latest.get(c.id)?.status??null,
      withdrawalNotation:latest.get(c.id)?.metadata.withdrawalNotation??null,
    })),
    requests:requests.filter(r=>r.metadata.synthetic===true).map(r=>({id:r.id,sectionId:r.subjectId,status:r.status,operation:r.metadata.operation??"add",title:r.title})),
  };
});

export const requestCourseChange = createServerFn({ method:"POST" })
  .validator((value:unknown)=>z.object({sectionId:z.string().uuid(),operation:z.enum(["add","drop","withdraw"])}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("student");
    const actor=await requireActor(["student"]);
    const sites=actorSiteIds(actor);
    if (!process.env.DATABASE_URL) throw new Error("Neon not configured");
    const studentId=await studentProfileFor(actor);
    const [{ db },s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [section]=await tx.select({id:s.sections.id,title:s.sections.title,metadata:s.sections.metadata,programId:s.sections.programId,siteId:s.sections.siteId,schoolYearId:s.terms.schoolYearId,organizationId:s.programs.organizationId})
        .from(s.sections).innerJoin(s.terms,eq(s.terms.id,s.sections.termId)).innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
        .where(and(eq(s.sections.id,data.sectionId),inArray(s.sections.siteId,sites),eq(s.sections.active,true))).limit(1);
      if(!section) throw new Error("Section not offered at this Site");
      assertProgramGranted(actor,section.programId);
      const policy=registrationPolicy(section.metadata);
      const today=new Date().toISOString().slice(0,10);
      if(data.operation==="drop" && today>policy.addDropEndsOn) throw new Error("Add/drop window has closed. Request withdrawal instead.");
      if(data.operation==="withdraw" && today>policy.withdrawalEndsOn) throw new Error("Withdrawal window has closed.");
      if(data.operation==="add" && today>policy.addDropEndsOn) throw new Error("Registration window has closed.");
      const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.sectionId,section.id),eq(s.enrollments.status,"active"))).limit(1);
      if(data.operation==="add" && membership) throw new Error("Already enrolled in this class");
      if(data.operation!=="add" && !membership) throw new Error("Not currently enrolled in this class");
      const outstanding=await tx.select().from(s.actions).where(and(
        eq(s.actions.type,"course_registration_request"),eq(s.actions.ownerPersonId,actor.actorPersonId),
        eq(s.actions.subjectId,section.id),inArray(s.actions.status,["open","in_progress","waiting"])));
      if(outstanding.length) throw new Error("An enrollment change is already pending for this class");
      const [request]=await tx.insert(s.actions).values({
        type:"course_registration_request",status:"open",priority:"normal",
        title:`${data.operation==="add"?"Add":data.operation==="drop"?"Drop":"Withdraw from"} ${section.title}`,
        description:data.operation==="withdraw"?"Withdrawal requires review of transcript consequences.":"Requested by the student.",
        ownerPersonId:actor.actorPersonId,organizationId:section.organizationId,siteId:section.siteId,programId:section.programId,subjectType:"section",subjectId:section.id,
        metadata:{synthetic:true,fixture:"gf40",operation:data.operation,studentProfileId:studentId,schoolYearId:section.schoolYearId,enrollmentId:membership?.id??null},
      }).returning({id:s.actions.id});
      if(!request)throw new Error("Unable to create course request");
      await recordAudit(tx,actor,{action:"course_registration.request",resourceType:"action",resourceId:request.id,after:{operation:data.operation,sectionId:section.id},scope:{programId:section.programId,siteId:section.siteId}});
      return {requestId:request.id};
    });
  });

export const decideCourseChange = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({requestId:z.string().uuid(),approve:z.boolean()}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("registrar");
    const actor=await requireActor(["registrar"],"registrations:approve");
    const sites=actorSiteIds(actor);
    if(!process.env.DATABASE_URL)throw new Error("Neon not configured");
    const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [request]=await tx.select().from(s.actions).where(and(
        eq(s.actions.id,data.requestId),eq(s.actions.type,"course_registration_request"),
        eq(s.actions.status,"open"))).limit(1).for("update");
      if(!request||request.metadata.synthetic!==true||request.metadata.fixture!=="gf40")throw new Error("Pending synthetic request not found");
      assertProgramGranted(actor,request.programId);
      if(!request.siteId||!sites.includes(request.siteId))throw new AuthorizationError("site scope");
      const studentProfileId=String(request.metadata.studentProfileId??"");
      const schoolYearId=String(request.metadata.schoolYearId??"");
      const programId=request.programId!,organizationId=request.organizationId!,siteId=request.siteId;
      const operation=request.metadata.operation;
      const sectionId=request.subjectId;
      if(!studentProfileId||!sectionId||!["add","drop","withdraw"].includes(String(operation)))throw new Error("Invalid request");
      if(data.approve){
        const [section]=await tx.select({id:s.sections.id,metadata:s.sections.metadata}).from(s.sections).where(and(eq(s.sections.id,sectionId),eq(s.sections.siteId,siteId),eq(s.sections.programId,programId),eq(s.sections.active,true))).limit(1).for("update");
        if(!section)throw new Error("Section unavailable");
        const policyAtApproval=registrationPolicy(section.metadata);
        const today=new Date().toISOString().slice(0,10);
        if(operation==="add" && today>policyAtApproval.addDropEndsOn)throw new Error("Registration window closed before approval");
        if(operation==="drop" && today>policyAtApproval.addDropEndsOn)throw new Error("Drop deadline passed; submit withdrawal request");
        if(operation==="withdraw" && today>policyAtApproval.withdrawalEndsOn)throw new Error("Withdrawal deadline passed");
        if(operation==="add"){
          const policy=registrationPolicy(section.metadata);
          const roster=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.status,"active")));
          if(roster.length>=policy.capacity)throw new Error("Class is full");
          const current=await tx.select({code:s.sections.code,metadata:s.sections.metadata,status:s.enrollments.status})
            .from(s.enrollments).innerJoin(s.sections,eq(s.enrollments.sectionId,s.sections.id))
            .where(and(eq(s.enrollments.studentProfileId,studentProfileId),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active")));
          if(policy.prerequisites.length)throw new Error("Prerequisite completion cannot yet be verified automatically; registrar verification required");
          if(policy.meetingKey && current.some(x=>x.status==="active"&&registrationPolicy(x.metadata).meetingKey===policy.meetingKey))throw new Error("Schedule conflict");
          const existing=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentProfileId),eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.status,"active")));
          if(existing.length)throw new Error("Already enrolled");
          await tx.insert(s.enrollments).values({studentProfileId,kind:"section",status:"active",organizationId,programId,schoolYearId,sectionId,startedAt:new Date(),metadata:{synthetic:true,source:"gf40"}});
        } else {
          const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,studentProfileId),eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.status,"active"))).limit(1);
          if(!membership)throw new Error("Enrollment no longer active");
          await tx.update(s.enrollments).set({status:operation==="drop"?"cancelled":"withdrawn",endedAt:new Date(),updatedAt:new Date(),
            metadata:{...membership.metadata,synthetic:true,withdrawalNotation:operation==="withdraw"?"W":null,changeRequestId:request.id}
          }).where(eq(s.enrollments.id,membership.id));
        }
      }
      await tx.update(s.actions).set({status:data.approve?"resolved":"cancelled",resolvedAt:new Date(),
        resolutionNote:data.approve?"Approved enrollment change":"Declined enrollment change",updatedAt:new Date()}).where(eq(s.actions.id,request.id));
      if(request.ownerPersonId)await tx.insert(s.notifications).values({recipientPersonId:request.ownerPersonId,type:"course_registration_decision",status:"unread",
        title:data.approve?"Your class change was approved":"Your class change was declined",body:request.title,resourceType:"action",resourceId:request.id});
      await recordAudit(tx,actor,{action:data.approve?"course_registration.approve":"course_registration.decline",resourceType:"action",resourceId:request.id,before:{status:"open"},after:{status:data.approve?"resolved":"cancelled",operation:String(operation)},scope:{programId,siteId}});
      return {approved:data.approve};
    });
  });
