import { assertSyntheticMutation } from "./demo-write-gate";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";

const STUDENT = "f1000000-0000-4000-8000-000000000007";
const PERSON = "f1000000-0000-4000-8000-000000000005";
const SITE = "f1000000-0000-4000-8000-000000000003";
const PROGRAM = "f1000000-0000-4000-8000-000000000004";
const ORG = "f1000000-0000-4000-8000-000000000002";
const YEAR = "f1000000-0000-4000-8000-000000000009";
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
  if (!process.env.DATABASE_URL) return { connected: false, sections: [], requests: [] };
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [catalog, memberships, requests] = await Promise.all([
    db.select({ id:s.sections.id, title:s.sections.title, code:s.sections.code, metadata:s.sections.metadata,
      templateId:s.courseTemplates.id, subject:s.courseTemplates.subject, description:s.courseTemplates.description,
    }).from(s.sections)
      .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
      .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
      .where(and(eq(s.sections.siteId,SITE),eq(s.sections.programId,PROGRAM),eq(s.sections.active,true))),
    db.select({ id:s.enrollments.id, sectionId:s.enrollments.sectionId, status:s.enrollments.status, metadata:s.enrollments.metadata })
      .from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.kind,"section"),eq(s.enrollments.programId,PROGRAM))),
    db.select({ id:s.actions.id, title:s.actions.title, status:s.actions.status, subjectId:s.actions.subjectId, metadata:s.actions.metadata })
      .from(s.actions).where(and(eq(s.actions.ownerPersonId,PERSON),eq(s.actions.type,"course_registration_request"))),
  ]);
  const latest = new Map<string,(typeof memberships)[number]>();
  for (const membership of memberships) if (membership.sectionId) latest.set(membership.sectionId,membership);
  return {
    connected:true,
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
  .validator((value:{sectionId:string;operation:"add"|"drop"|"withdraw"})=>value)
  .handler(async({data})=>{
  assertSyntheticMutation("student");
    if (!process.env.DATABASE_URL) throw new Error("Neon not configured");
    const [{ db },s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [section]=await tx.select({id:s.sections.id,title:s.sections.title,metadata:s.sections.metadata}).from(s.sections).where(and(
        eq(s.sections.id,data.sectionId),eq(s.sections.siteId,SITE),eq(s.sections.programId,PROGRAM),eq(s.sections.active,true))).limit(1);
      if(!section) throw new Error("Section not offered at this Site");
      const policy=registrationPolicy(section.metadata);
      const today=new Date().toISOString().slice(0,10);
      if(data.operation==="drop" && today>policy.addDropEndsOn) throw new Error("Add/drop window has closed. Request withdrawal instead.");
      if(data.operation==="withdraw" && today>policy.withdrawalEndsOn) throw new Error("Withdrawal window has closed.");
      if(data.operation==="add" && today>policy.addDropEndsOn) throw new Error("Registration window has closed.");
      const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.sectionId,section.id),eq(s.enrollments.status,"active"))).limit(1);
      if(data.operation==="add" && membership) throw new Error("Already enrolled in this class");
      if(data.operation!=="add" && !membership) throw new Error("Not currently enrolled in this class");
      const outstanding=await tx.select().from(s.actions).where(and(
        eq(s.actions.type,"course_registration_request"),eq(s.actions.ownerPersonId,PERSON),
        eq(s.actions.subjectId,section.id),inArray(s.actions.status,["open","in_progress","waiting"])));
      if(outstanding.length) throw new Error("An enrollment change is already pending for this class");
      const [request]=await tx.insert(s.actions).values({
        type:"course_registration_request",status:"open",priority:"normal",
        title:`${data.operation==="add"?"Add":data.operation==="drop"?"Drop":"Withdraw from"} ${section.title}`,
        description:data.operation==="withdraw"?"Withdrawal requires review of transcript consequences.":"Requested by the synthetic family.",
        ownerPersonId:PERSON,organizationId:ORG,siteId:SITE,programId:PROGRAM,subjectType:"section",subjectId:section.id,
        metadata:{synthetic:true,fixture:"gf40",operation:data.operation,studentProfileId:STUDENT,enrollmentId:membership?.id??null},
      }).returning({id:s.actions.id});
      if(!request)throw new Error("Unable to create course request");
      return {requestId:request.id};
    });
  });

export const decideCourseChange = createServerFn({method:"POST"})
  .validator((value:{requestId:string;approve:boolean})=>value)
  .handler(async({data})=>{
  assertSyntheticMutation("registrar");
    if(!process.env.DATABASE_URL)throw new Error("Neon not configured");
    const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [request]=await tx.select().from(s.actions).where(and(
        eq(s.actions.id,data.requestId),eq(s.actions.type,"course_registration_request"),
        eq(s.actions.ownerPersonId,PERSON),eq(s.actions.status,"open"))).limit(1).for("update");
      if(!request||request.metadata.synthetic!==true||request.metadata.fixture!=="gf40")throw new Error("Pending synthetic request not found");
      const operation=request.metadata.operation;
      const sectionId=request.subjectId;
      if(!sectionId||!["add","drop","withdraw"].includes(String(operation)))throw new Error("Invalid request");
      if(data.approve){
        const [section]=await tx.select({id:s.sections.id,metadata:s.sections.metadata}).from(s.sections).where(and(eq(s.sections.id,sectionId),eq(s.sections.siteId,SITE),eq(s.sections.programId,PROGRAM),eq(s.sections.active,true))).limit(1).for("update");
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
            .where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.kind,"section"),inArray(s.enrollments.status,["active","completed"])));
          const codes=new Set(current.filter(x=>x.status==="completed").map(x=>x.code));
          if(policy.prerequisites.some(code=>!codes.has(code)))throw new Error("Prerequisite not met");
          if(policy.meetingKey && current.some(x=>x.status==="active"&&registrationPolicy(x.metadata).meetingKey===policy.meetingKey))throw new Error("Schedule conflict");
          const existing=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.status,"active")));
          if(existing.length)throw new Error("Already enrolled");
          await tx.insert(s.enrollments).values({studentProfileId:STUDENT,kind:"section",status:"active",organizationId:ORG,programId:PROGRAM,schoolYearId:YEAR,sectionId,startedAt:new Date(),metadata:{synthetic:true,source:"gf40"}});
        } else {
          const [membership]=await tx.select().from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.status,"active"))).limit(1);
          if(!membership)throw new Error("Enrollment no longer active");
          await tx.update(s.enrollments).set({status:operation==="drop"?"cancelled":"withdrawn",endedAt:new Date(),updatedAt:new Date(),
            metadata:{...membership.metadata,synthetic:true,withdrawalNotation:operation==="withdraw"?"W":null,changeRequestId:request.id}
          }).where(eq(s.enrollments.id,membership.id));
        }
      }
      await tx.update(s.actions).set({status:data.approve?"resolved":"cancelled",resolvedAt:new Date(),
        resolutionNote:data.approve?"Approved synthetic enrollment change":"Declined synthetic enrollment change",updatedAt:new Date()}).where(eq(s.actions.id,request.id));
      return {approved:data.approve};
    });
  });
