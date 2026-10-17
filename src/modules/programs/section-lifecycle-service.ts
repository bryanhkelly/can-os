import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, auditEvents, domainEvents, enrollments, instructionalCapacityReservations,
  instructionalCapacityOfferings, notifications, programs, roleAssignments,
  sectionCapacityDemands, sectionTeachers, sections, terms, scheduleTemplates,
} from "@/db/schema";
import { assertCapability, assertProgramScope, assertSectionScope, assertSiteScope, AuthorizationError, type CommandContext } from "@/domain/command-context";

type LifecycleContext = CommandContext & { actorPersonId: string };
async function authorizedSection(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: LifecycleContext, sectionId: string) {
  const [row] = await tx.select({
    id: sections.id, title: sections.title, active: sections.active,
    metadata: sections.metadata, programId: sections.programId, siteId: sections.siteId,
    scheduleTemplateId: sections.scheduleTemplateId, termId: sections.termId,
    startsAt: sections.startsAt, endsAt: sections.endsAt, organizationId: programs.organizationId,
    providerOrganizationId: programs.academicProviderOrganizationId,
  }).from(sections).innerJoin(programs, eq(programs.id, sections.programId))
    .where(eq(sections.id, sectionId)).limit(1).for("update");
  if (!row || !context.scope.organizationIds?.includes(row.organizationId)) throw new AuthorizationError("section organization");
  assertProgramScope(context, row.programId);
  assertSectionScope(context, row.id);
  assertSiteScope(context, row.siteId);
  return row;
}
async function journal(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: LifecycleContext, section: Awaited<ReturnType<typeof authorizedSection>>, action: string, before: Record<string,unknown>, after: Record<string,unknown>) {
  await tx.insert(auditEvents).values({
    actorPersonId: context.actorPersonId, action, resourceType:"section", resourceId: section.id,
    scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
    before,after,
  });
  await tx.insert(domainEvents).values({
    eventType: action, aggregateType:"section", aggregateId:section.id,
    actorPersonId:context.actorPersonId, payload:{programId:section.programId, siteId:section.siteId, ...after},
  });
}
export async function sectionLifecycleSnapshot(context: LifecycleContext, programId: string) {
  assertCapability(context, "program.launch.start");
  assertProgramScope(context, programId);
  const [program] = await db.select().from(programs).where(eq(programs.id,programId)).limit(1);
  if (!program || !context.scope.organizationIds?.includes(program.organizationId) ||
    (program.siteId && context.scope.siteIds && !context.scope.siteIds.includes(program.siteId)))
    throw new AuthorizationError("program lifecycle");
  const rows=await db.select().from(sections).where(eq(sections.programId,programId));
  const ids=rows.map(r=>r.id);
  const [staff, students, waits, allocations]=await Promise.all([
    ids.length?db.select({sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId})
      .from(sectionTeachers).where(inArray(sectionTeachers.sectionId,ids)):[],
    ids.length?db.select({sectionId:enrollments.sectionId,id:enrollments.id,studentProfileId:enrollments.studentProfileId,status:enrollments.status})
      .from(enrollments).where(and(inArray(enrollments.sectionId,ids),eq(enrollments.kind,"section"),eq(enrollments.status,"active"))):[],
    ids.length?db.select({id:actions.id,sectionId:actions.sectionId,subjectId:actions.subjectId,status:actions.status,metadata:actions.metadata})
      .from(actions).where(and(eq(actions.type,"section_waitlist"),inArray(actions.sectionId,ids),inArray(actions.status,["open","waiting"]))):[],
    ids.length?db.select({sectionId:instructionalCapacityReservations.sectionId,id:instructionalCapacityReservations.id,status:instructionalCapacityReservations.status,offeringId:instructionalCapacityReservations.offeringId})
      .from(instructionalCapacityReservations).where(inArray(instructionalCapacityReservations.sectionId,ids)):[],
  ]);
  return rows.map(row=>({
    id:row.id,title:row.title,code:row.code,active:row.active,
    startsAt:row.startsAt?.toISOString()??null,endsAt:row.endsAt?.toISOString()??null,
    scheduleTemplateId:row.scheduleTemplateId,
    teachers:staff.filter(t=>t.sectionId===row.id),
    students:students.filter(e=>e.sectionId===row.id),
    waitlist:waits.filter(w=>w.sectionId===row.id),
    allocations:allocations.filter(a=>a.sectionId===row.id),
  }));
}
export async function changeSectionSchedule(context: LifecycleContext, input: {sectionId:string;scheduleTemplateId:string|null;startsAt:Date|null;endsAt:Date|null;reason:string}) {
  assertCapability(context,"program.launch.start");
  if(input.startsAt && input.endsAt && input.startsAt>=input.endsAt)throw new Error("Section end must follow start");
  if(input.reason.trim().length<5)throw new Error("Provide a reason for the schedule change");
  await db.transaction(async tx=>{
    const section=await authorizedSection(tx,context,input.sectionId);
    if(!section.active)throw new Error("Cannot reschedule a closed section");
    if(input.scheduleTemplateId){
      const [template]=await tx.select({id:scheduleTemplates.id,schoolYearId:scheduleTemplates.schoolYearId})
        .from(scheduleTemplates).where(eq(scheduleTemplates.id,input.scheduleTemplateId)).limit(1);
      const [term]=await tx.select({schoolYearId:terms.schoolYearId}).from(terms).where(eq(terms.id,section.termId)).limit(1);
      if(!template||!term||template.schoolYearId!==term.schoolYearId)throw new Error("Schedule must belong to the same school year");
    }
    const [demand]=await tx.select({id:sectionCapacityDemands.id}).from(sectionCapacityDemands)
      .where(eq(sectionCapacityDemands.sectionId,section.id)).limit(1);
    if(demand) {
      const reservations=await tx.select({id:instructionalCapacityReservations.id}).from(instructionalCapacityReservations)
        .where(and(eq(instructionalCapacityReservations.sectionId,section.id),inArray(instructionalCapacityReservations.status,["held","committed"])));
      if(reservations.length)throw new Error("Release or replace committed capacity before changing this section's schedule");
    }
    await tx.update(sections).set({scheduleTemplateId:input.scheduleTemplateId,startsAt:input.startsAt,endsAt:input.endsAt,updatedAt:new Date()}).where(eq(sections.id,section.id));
    await journal(tx,context,section,"SectionScheduleChanged",
      {scheduleTemplateId:section.scheduleTemplateId,startsAt:section.startsAt?.toISOString()??null,endsAt:section.endsAt?.toISOString()??null},
      {scheduleTemplateId:input.scheduleTemplateId,startsAt:input.startsAt?.toISOString()??null,endsAt:input.endsAt?.toISOString()??null,reason:input.reason.trim()});
  });
}
export async function changeSectionState(context: LifecycleContext, sectionId:string, active:boolean, reason:string) {
  assertCapability(context,"program.launch.start");
  if(reason.trim().length<5)throw new Error("Explain the section transition");
  await db.transaction(async tx=>{
    const section=await authorizedSection(tx,context,sectionId);
    if(section.active===active)return;
    if(!active){
      const roster=await tx.select({id:enrollments.id}).from(enrollments).where(and(eq(enrollments.sectionId,section.id),eq(enrollments.status,"active")));
      if(roster.length)throw new Error("Withdraw or transfer all active students before closing this section");
      const reserved=await tx.select({id:instructionalCapacityReservations.id}).from(instructionalCapacityReservations)
        .where(and(eq(instructionalCapacityReservations.sectionId,section.id),inArray(instructionalCapacityReservations.status,["held","committed"])));
      if(reserved.length)throw new Error("Release all capacity reservations before closing this section");
    }
    await tx.update(sections).set({active,updatedAt:new Date(),metadata:{...section.metadata,lastLifecycleReason:reason.trim()}}).where(eq(sections.id,section.id));
    await journal(tx,context,section,active?"SectionReopened":"SectionClosed",{active:section.active},{active,reason:reason.trim()});
  });
}
export async function replaceSectionTeacher(context: LifecycleContext, input:{sectionId:string;oldPersonId:string;newPersonId:string;reason:string}) {
  assertCapability(context,"program.launch.start");
  if(input.oldPersonId===input.newPersonId)throw new Error("Choose a different replacement instructor");
  if(input.reason.trim().length<5)throw new Error("Explain the staffing change");
  await db.transaction(async tx=>{
    const section=await authorizedSection(tx,context,input.sectionId);
    if(!section.active)throw new Error("Cannot staff a closed section");
    const [old]=await tx.select().from(sectionTeachers).where(and(eq(sectionTeachers.sectionId,section.id),eq(sectionTeachers.personId,input.oldPersonId))).limit(1);
    if(!old)throw new Error("Outgoing instructor is not assigned");
    const [eligible]=await tx.select({id:roleAssignments.id}).from(roleAssignments).where(and(
      eq(roleAssignments.personId,input.newPersonId),eq(roleAssignments.roleKey,"teacher"),
      inArray(roleAssignments.organizationId,[section.organizationId,section.providerOrganizationId]))).limit(1);
    if(!eligible)throw new AuthorizationError("replacement instructor must hold a teacher role");
    const capacity=await tx.select({id:instructionalCapacityReservations.id}).from(instructionalCapacityReservations)
      .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
      .where(and(eq(instructionalCapacityReservations.sectionId,section.id),
        eq(instructionalCapacityOfferings.personId,input.oldPersonId),
        inArray(instructionalCapacityReservations.status,["held","committed"])));
    if(capacity.length)throw new Error("Outgoing instructor has reserved instructional capacity. Release it and commit replacement capacity before changing the teaching roster.");
    await tx.insert(sectionTeachers).values({sectionId:section.id,personId:input.newPersonId,role:old.role})
      .onConflictDoNothing();
    await tx.delete(sectionTeachers).where(eq(sectionTeachers.id,old.id));
    await tx.insert(notifications).values({
      recipientPersonId:input.newPersonId,type:"teaching_assignment",title:"New teaching assignment",
      body:"You have been assigned to "+section.title,resourceType:"section",resourceId:section.id,
    });
    await journal(tx,context,section,"SectionTeacherReplaced",
      {personId:input.oldPersonId},{personId:input.newPersonId,reason:input.reason.trim()});
  });
}
export async function changeSectionEnrollment(context: LifecycleContext,input:{enrollmentId:string;status:"transferred"|"withdrawn";reason:string}) {
  assertCapability(context,"program.launch.start");
  if(input.reason.trim().length<5)throw new Error("Provide an enrollment transition reason");
  await db.transaction(async tx=>{
    const [record]=await tx.select().from(enrollments).where(eq(enrollments.id,input.enrollmentId)).limit(1).for("update");
    if(!record||record.kind!=="section"||!record.sectionId||record.status!=="active")throw new Error("Active section enrollment not found");
    const section=await authorizedSection(tx,context,record.sectionId);
    await tx.update(enrollments).set({status:input.status,endedAt:new Date(),metadata:{...record.metadata,lifecycleReason:input.reason.trim()},updatedAt:new Date()}).where(eq(enrollments.id,record.id));
    await journal(tx,context,section,"SectionEnrollmentChanged",{enrollmentId:record.id,status:"active"},
      {enrollmentId:record.id,status:input.status,reason:input.reason.trim()});
  });
}
export async function addSectionWaitlist(context: LifecycleContext,input:{sectionId:string;studentProfileId:string;reason:string}) {
  assertCapability(context,"program.launch.start");
  await db.transaction(async tx=>{
    const section=await authorizedSection(tx,context,input.sectionId);
    if(!section.active)throw new Error("Section is closed");
    const [existing]=await tx.select({id:actions.id}).from(actions).where(and(eq(actions.type,"section_waitlist"),
      eq(actions.sectionId,section.id),eq(actions.subjectId,input.studentProfileId),inArray(actions.status,["open","waiting"]))).limit(1);
    if(existing)return;
    await tx.insert(actions).values({
      type:"section_waitlist",title:"Section enrollment waitlist: "+section.title,status:"waiting",
      subjectType:"student_profile",subjectId:input.studentProfileId,
      organizationId:section.organizationId,programId:section.programId,siteId:section.siteId,sectionId:section.id,
      description:input.reason.trim()||"Pending an available instructional seat",
      metadata:{requestedAt:new Date().toISOString()},
    });
    await journal(tx,context,section,"SectionWaitlistAdded",{}, {studentProfileId:input.studentProfileId});
  });
}
export async function resolveSectionWaitlist(context: LifecycleContext, actionId:string, reason:string) {
  assertCapability(context,"program.launch.start");
  await db.transaction(async tx=>{
    const [record]=await tx.select().from(actions).where(and(eq(actions.id,actionId),eq(actions.type,"section_waitlist"))).limit(1).for("update");
    if(!record||!record.sectionId)throw new Error("Waitlist item not found");
    const section=await authorizedSection(tx,context,record.sectionId);
    if(!["open","waiting"].includes(record.status))return;
    await tx.update(actions).set({status:"resolved",resolvedAt:new Date(),resolutionNote:reason.trim()||"Reviewed",updatedAt:new Date()}).where(eq(actions.id,record.id));
    await journal(tx,context,section,"SectionWaitlistResolved",{}, {waitlistActionId:record.id,reason:reason.trim()});
  });
}
