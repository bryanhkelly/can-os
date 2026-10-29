import { db } from "@/db/client";
import {
actions,
deliveryArrangements,
enrollments,
instructionalCapacityOfferings,
instructionalCapacityReservations,
programs,roleAssignments,
scheduleTemplates,
sectionCapacityDemands,
sections,
sectionTeachers,
terms
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { assertCapability,assertProgramScope,assertSectionScope,assertSiteScope,AuthorizationError,type CommandContext } from "@/domain/command-context";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { and,eq,inArray,sql } from "drizzle-orm";
import { currentCapacityReservationFilter } from "@/modules/staffing/reservation-policy";
import { assignLaunchInstructor } from "@/modules/staffing/launch-staffing.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";

import { EventTypes, type EventType } from "@/domain/event-types";
type LifecycleContext = CommandContext & { actorPersonId: string };
async function authorizedSection(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: LifecycleContext, sectionId: string) {
  // Acquire the attendance configuration lock BEFORE row FOR UPDATE. The
  // attendance mark command takes the site lock before reading section rows.
  const [location] = await tx.select({ siteId: sections.siteId })
    .from(sections).where(eq(sections.id, sectionId)).limit(1);
  if (!location || (location.siteId !== null && !context.scope.siteIds?.includes(location.siteId)))
    throw new AuthorizationError("section site");
  // Site-less online sections have no onsite attendance configuration to coordinate.
  if (location.siteId) await lockAttendanceConfigurationAtSite(tx, location.siteId);
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
async function journal(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], context: LifecycleContext, section: Awaited<ReturnType<typeof authorizedSection>>, action: EventType, before: Record<string,unknown>, after: Record<string,unknown>) {
  await writeAudit(tx, {
    actorPersonId: context.actorPersonId, action, resourceType:"section", resourceId: section.id,
    scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
    before,after,
  });
  await emitEvent(tx, {
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
  const rows=await db.select().from(sections).where(and(
    eq(sections.programId,programId),
    ...(context.scope.sectionIds ? [inArray(sections.id,context.scope.sectionIds)] : []),
    ...(context.scope.siteIds ? [inArray(sections.siteId,context.scope.siteIds)] : []),
  ));
  const ids=rows.map(r=>r.id);
  const schedules=await db.select({scheduleId:scheduleTemplates.id,name:scheduleTemplates.name,schoolYearId:scheduleTemplates.schoolYearId}).from(scheduleTemplates);
  const termYears=rows.length?await db.select({termId:terms.id,schoolYearId:terms.schoolYearId}).from(terms)
    .where(inArray(terms.id,[...new Set(rows.map(r=>r.termId))])):[];
  const yearByTerm=new Map(termYears.map(t=>[t.termId,t.schoolYearId]));
  const [staff, students, waits, allocations, demands]=await Promise.all([
    ids.length?db.select({sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId})
      .from(sectionTeachers).where(inArray(sectionTeachers.sectionId,ids)):[],
    ids.length?db.select({sectionId:enrollments.sectionId,id:enrollments.id,studentProfileId:enrollments.studentProfileId,status:enrollments.status})
      .from(enrollments).where(and(inArray(enrollments.sectionId,ids),eq(enrollments.kind,"section"),eq(enrollments.status,"active"))):[],
    ids.length?db.select({id:actions.id,sectionId:actions.sectionId,subjectId:actions.subjectId,status:actions.status,metadata:actions.metadata})
      .from(actions).where(and(eq(actions.type,"section_waitlist"),inArray(actions.sectionId,ids),inArray(actions.status,["open","waiting","in_progress"]))):[],
    ids.length?db.select({sectionId:instructionalCapacityReservations.sectionId,id:instructionalCapacityReservations.id,status:instructionalCapacityReservations.status,offeringId:instructionalCapacityReservations.offeringId})
      .from(instructionalCapacityReservations).where(inArray(instructionalCapacityReservations.sectionId,ids)):[],
    ids.length?db.select({id:sectionCapacityDemands.id,sectionId:sectionCapacityDemands.sectionId})
      .from(sectionCapacityDemands).where(inArray(sectionCapacityDemands.sectionId,ids)):[],
  ]);
  return rows.map(row=>({
    id:row.id,title:row.title,code:row.code,active:row.active,
    startsAt:row.startsAt?.toISOString()??null,endsAt:row.endsAt?.toISOString()??null,
    scheduleTemplateId:row.scheduleTemplateId,
    scheduleOptions:schedules.filter(s=>s.schoolYearId===yearByTerm.get(row.termId))
      .map(s=>({id:s.scheduleId,name:s.name})),
    teachers:staff.filter(t=>t.sectionId===row.id),
    students:students.filter(e=>e.sectionId===row.id),
    waitlist:waits.filter(w=>w.sectionId===row.id),
    allocations:allocations.filter(a=>a.sectionId===row.id),
    demandId:demands.find(d=>d.sectionId===row.id)?.id??null,
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
    await journal(tx,context,section,EventTypes.SectionScheduleChanged,
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
      // Preserve waitlist history but prevent enrollment into a closed class.
      await tx.update(actions).set({status:"cancelled",resolutionNote:"Section closed",
        resolvedAt:new Date(),updatedAt:new Date()})
        .where(and(eq(actions.type,"section_waitlist"),eq(actions.sectionId,section.id),
          inArray(actions.status,["open","waiting","in_progress"])));
    }
    await tx.update(sections).set({active,updatedAt:new Date(),metadata:{...section.metadata,lastLifecycleReason:reason.trim()}}).where(eq(sections.id,section.id));
    await journal(tx,context,section,active?EventTypes.SectionReopened:EventTypes.SectionClosed,{active:section.active},{active,reason:reason.trim()});
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
      activeRoleAssignmentPredicate(),
      inArray(roleAssignments.organizationId,[section.organizationId,...(section.providerOrganizationId ? [section.providerOrganizationId] : [])]))).limit(1);
    if(!eligible)throw new AuthorizationError("replacement instructor must hold a teacher role");
    const capacity=await tx.select({id:instructionalCapacityReservations.id}).from(instructionalCapacityReservations)
      .innerJoin(instructionalCapacityOfferings,eq(instructionalCapacityOfferings.id,instructionalCapacityReservations.offeringId))
      .where(and(eq(instructionalCapacityReservations.sectionId,section.id),
        eq(instructionalCapacityOfferings.personId,input.oldPersonId),
        inArray(instructionalCapacityReservations.status,["held","committed"])));
    if(capacity.length)throw new Error("Outgoing instructor has reserved instructional capacity. Release it and commit replacement capacity before changing the teaching roster.");
    if(section.siteId){
      await assignLaunchInstructor(tx,context,{programId:section.programId,sectionId:section.id,teacherPersonId:input.newPersonId});
      await tx.update(deliveryArrangements).set({status:"completed",updatedAt:new Date()}).where(and(
        eq(deliveryArrangements.sectionId,section.id),eq(deliveryArrangements.instructorPersonId,input.oldPersonId),
        eq(deliveryArrangements.status,"active")));
    }else{
      await tx.insert(sectionTeachers).values({sectionId:section.id,personId:input.newPersonId,role:old.role,assignmentSource:"manual"})
        .onConflictDoNothing();
    }
    await tx.delete(sectionTeachers).where(eq(sectionTeachers.id,old.id));
    if(!section.siteId)await notify(tx, {
      recipientPersonId:input.newPersonId,type:"teaching_assignment",title:"New teaching assignment",
      body:"You have been assigned to "+section.title,resourceType:"section",resourceId:section.id,
    });
    await journal(tx,context,section,EventTypes.SectionTeacherReplaced,
      {personId:input.oldPersonId},{personId:input.newPersonId,reason:input.reason.trim()});
  });
}
export async function changeSectionEnrollment(context: LifecycleContext,input:{enrollmentId:string;status:"transferred"|"withdrawn";reason:string}) {
  assertCapability(context,"program.launch.start");
  if(input.reason.trim().length<5)throw new Error("Provide an enrollment transition reason");
  await db.transaction(async tx=>{
    // Obtain the site lock before locking an enrollment row to keep lock order
    // consistent with attendance's configuration -> enrollment row reads.
    const [enrollmentSite] = await tx.select({ siteId: sections.siteId })
      .from(enrollments).innerJoin(sections,eq(sections.id,enrollments.sectionId))
      .where(eq(enrollments.id,input.enrollmentId)).limit(1);
    if (!enrollmentSite || (enrollmentSite.siteId !== null && !context.scope.siteIds?.includes(enrollmentSite.siteId)))
      throw new AuthorizationError("section enrollment site");
    if (enrollmentSite.siteId) await lockAttendanceConfigurationAtSite(tx, enrollmentSite.siteId);
    const [record]=await tx.select().from(enrollments).where(eq(enrollments.id,input.enrollmentId)).limit(1).for("update");
    if(!record||record.kind!=="section"||!record.sectionId||record.status!=="active")throw new Error("Active section enrollment not found");
    const section=await authorizedSection(tx,context,record.sectionId);
    await tx.update(enrollments).set({status:input.status,endedAt:new Date(),metadata:{...record.metadata,lifecycleReason:input.reason.trim()},updatedAt:new Date()}).where(eq(enrollments.id,record.id));
    await journal(tx,context,section,EventTypes.SectionEnrollmentChanged,{enrollmentId:record.id,status:"active"},
      {enrollmentId:record.id,status:input.status,reason:input.reason.trim()});
  });
}
export async function addSectionWaitlist(context: LifecycleContext,input:{sectionId:string;studentProfileId:string;reason:string}) {
  assertCapability(context,"program.launch.start");
  await db.transaction(async tx=>{
    const section=await authorizedSection(tx,context,input.sectionId);
    if(!section.active)throw new Error("Section is closed");
    const [year]=await tx.select({schoolYearId:terms.schoolYearId}).from(terms)
      .where(eq(terms.id,section.termId)).limit(1);
    if(!year)throw new Error("Academic term not found");
    const [eligible]=await tx.select({id:enrollments.id}).from(enrollments).where(and(
      eq(enrollments.studentProfileId,input.studentProfileId),
      eq(enrollments.programId,section.programId),eq(enrollments.schoolYearId,year.schoolYearId),
      eq(enrollments.kind,"program"),eq(enrollments.status,"active"))).limit(1);
    if(!eligible)throw new Error("Student must be enrolled in this program and school year");
    const [alreadyEnrolled]=await tx.select({id:enrollments.id}).from(enrollments).where(and(
      eq(enrollments.studentProfileId,input.studentProfileId),
      eq(enrollments.sectionId,section.id),eq(enrollments.status,"active"))).limit(1);
    if(alreadyEnrolled)throw new Error("Student is already enrolled in this class");
    const [existing]=await tx.select({id:actions.id}).from(actions).where(and(eq(actions.type,"section_waitlist"),
      eq(actions.sectionId,section.id),eq(actions.subjectId,input.studentProfileId),inArray(actions.status,["open","waiting","in_progress"]))).limit(1);
    if(existing)return;
    await tx.insert(actions).values({
      type:"section_waitlist",title:"Section enrollment waitlist: "+section.title,status:"waiting",
      subjectType:"student_profile",subjectId:input.studentProfileId,
      organizationId:section.organizationId,programId:section.programId,siteId:section.siteId,sectionId:section.id,
      description:input.reason.trim()||"Pending an available instructional seat",
      metadata:{requestedAt:new Date().toISOString()},
    });
    await journal(tx,context,section,EventTypes.SectionWaitlistAdded,{}, {studentProfileId:input.studentProfileId});
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
    await journal(tx,context,section,EventTypes.SectionWaitlistResolved,{}, {waitlistActionId:record.id,reason:reason.trim()});
  });
}

/** Move a student between sections of one program and academic term as one transaction. */

/** Must be called with the destination section locked by authorizedSection. */
async function assertOpenEnrollmentSeat(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sectionId: string) {
  const [demand] = await tx.select({ seats: sectionCapacityDemands.expectedSeats, status: sectionCapacityDemands.status })
    .from(sectionCapacityDemands).where(eq(sectionCapacityDemands.sectionId, sectionId)).limit(1);
  if (!demand || demand.status !== "open") throw new Error("Section has no active instructional capacity demand");
  const [committed] = await tx.select({ seats: sql<number>`coalesce(sum(seats),0)::int` })
    .from(instructionalCapacityReservations)
    .where(and(eq(instructionalCapacityReservations.sectionId,sectionId),
      eq(instructionalCapacityReservations.status,"committed"),
      currentCapacityReservationFilter(new Date())));
  const [roster] = await tx.select({ count: sql<number>`count(*)::int` }).from(enrollments)
    .where(and(eq(enrollments.sectionId,sectionId),eq(enrollments.status,"active")));
  const ceiling = Math.min(demand.seats,Number(committed?.seats??0));
  if (Number(roster?.count??0)>=ceiling) throw new Error("No committed instructional seat is available");
}

export async function transferSectionEnrollment(context: LifecycleContext,input:{enrollmentId:string;destinationSectionId:string;reason:string}) {
  assertCapability(context,"program.launch.start");
  if(input.reason.trim().length<5)throw new Error("Provide a transfer reason");
  return db.transaction(async tx=>{
    // Cross-site transfers must take BOTH site locks in deterministic order
    // before any enrollment or section FOR UPDATE locks.
    const [enrollmentSite] = await tx.select({ siteId: sections.siteId })
      .from(enrollments).innerJoin(sections,eq(sections.id,enrollments.sectionId))
      .where(eq(enrollments.id,input.enrollmentId)).limit(1);
    const [destinationSite] = await tx.select({ siteId: sections.siteId })
      .from(sections).where(eq(sections.id,input.destinationSectionId)).limit(1);
    const transferSites = [...new Set([enrollmentSite?.siteId, destinationSite?.siteId]
      .filter((id): id is string => !!id))].sort();
    if (!enrollmentSite || !destinationSite ||
        !transferSites.every(id=>context.scope.siteIds?.includes(id)))
      throw new AuthorizationError("both section transfer sites");
    for (const siteId of transferSites) await lockAttendanceConfigurationAtSite(tx, siteId);
    const [sourceEnrollment]=await tx.select().from(enrollments).where(eq(enrollments.id,input.enrollmentId)).limit(1).for("update");
    if(!sourceEnrollment||sourceEnrollment.kind!=="section"||sourceEnrollment.status!=="active"||!sourceEnrollment.sectionId)
      throw new Error("Active section enrollment not found");
    // Lock in deterministic order to serialize concurrent section transitions.
    const ids=[sourceEnrollment.sectionId,input.destinationSectionId].sort();
    const scoped=[];
    for(const id of ids)scoped.push(await authorizedSection(tx,context,id));
    const source=scoped.find(s=>s.id===sourceEnrollment.sectionId)!;
    const destination=scoped.find(s=>s.id===input.destinationSectionId)!;
    if(source.id===destination.id)throw new Error("Source and destination must differ");
    if(!destination.active||source.programId!==destination.programId||source.termId!==destination.termId)
      throw new Error("Transfer requires an active section in the same program and academic term");
    const [existing]=await tx.select({id:enrollments.id}).from(enrollments).where(and(
      eq(enrollments.studentProfileId,sourceEnrollment.studentProfileId),
      eq(enrollments.sectionId,destination.id),eq(enrollments.status,"active"))).limit(1);
    if(existing)throw new Error("Student is already enrolled in destination section");
    await assertOpenEnrollmentSeat(tx,destination.id);
    const now=new Date();
    await tx.update(enrollments).set({
      status:"transferred",endedAt:now,updatedAt:now,
      metadata:{...sourceEnrollment.metadata,transferReason:input.reason.trim(),destinationSectionId:destination.id},
    }).where(eq(enrollments.id,sourceEnrollment.id));
    const [newEnrollment]=await tx.insert(enrollments).values({
      kind:"section",status:"active",organizationId:sourceEnrollment.organizationId,
      programId:sourceEnrollment.programId,schoolYearId:sourceEnrollment.schoolYearId,
      sectionId:destination.id,studentProfileId:sourceEnrollment.studentProfileId,
      startedAt:now,metadata:{transferredFromEnrollmentId:sourceEnrollment.id,reason:input.reason.trim()},
    }).returning({id:enrollments.id});
    await journal(tx,context,source,EventTypes.SectionStudentTransferred,
      {enrollmentId:sourceEnrollment.id},{destinationSectionId:destination.id,newEnrollmentId:newEnrollment!.id,reason:input.reason.trim()});
    return {newEnrollmentId:newEnrollment!.id};
  });
}

/** A waitlist promotion validates section availability, student eligibility and available seats. */
export async function promoteSectionWaitlist(context: LifecycleContext, actionId:string) {
 assertCapability(context,"program.launch.start");
 return db.transaction(async tx=>{
   const [item]=await tx.select().from(actions).where(and(eq(actions.id,actionId),eq(actions.type,"section_waitlist"))).limit(1).for("update");
   if(!item||!item.sectionId||!["waiting","open","in_progress"].includes(item.status))throw new Error("Pending waitlist record not found");
   if(item.status==="in_progress" && (!item.dueAt||item.dueAt<=new Date()))throw new Error("Waitlist offer expired");
   const section=await authorizedSection(tx,context,item.sectionId);
   if(!section.active)throw new Error("Section closed");
   const [existing]=await tx.select({id:enrollments.id}).from(enrollments).where(and(
     eq(enrollments.studentProfileId,item.subjectId),eq(enrollments.sectionId,section.id),eq(enrollments.status,"active"))).limit(1);
   if(existing)throw new Error("Student already enrolled");
   const [term]=await tx.select({schoolYearId:terms.schoolYearId}).from(terms).where(eq(terms.id,section.termId)).limit(1);
   if(!term)throw new Error("Academic term not found");
   const [member]=await tx.select().from(enrollments).where(and(
     eq(enrollments.studentProfileId,item.subjectId),eq(enrollments.programId,section.programId),
     eq(enrollments.schoolYearId,term.schoolYearId),eq(enrollments.kind,"program"),eq(enrollments.status,"active"))).limit(1);
   if(!member)throw new Error("Student needs active enrollment in this program/year");
   await assertOpenEnrollmentSeat(tx,section.id);
   const [record]=await tx.insert(enrollments).values({
     studentProfileId:item.subjectId,kind:"section",status:"active",
     organizationId:section.organizationId,programId:section.programId,
     sectionId:section.id,schoolYearId:term.schoolYearId,startedAt:new Date(),
     metadata:{promotedFromWaitlistActionId:item.id},
   }).returning({id:enrollments.id});
   await tx.update(actions).set({
     status:"resolved",resolvedAt:new Date(),resolutionNote:"Promoted to active enrollment",
     updatedAt:new Date(),
   }).where(eq(actions.id,item.id));
   await journal(tx,context,section,EventTypes.SectionWaitlistPromoted,{},
     {waitlistActionId:item.id,enrollmentId:record!.id,studentProfileId:item.subjectId});
   return {enrollmentId:record!.id};
 });
}

/** Issue a time-bounded enrollment offer without creating enrollment prematurely. */
export async function offerWaitlistSeat(context: LifecycleContext,actionId:string,expiresAt:Date) {
 assertCapability(context,"program.launch.start");
 if(expiresAt<=new Date()||expiresAt.getTime()>Date.now()+30*86400000)
   throw new Error("Offer expiry must be within the next 30 days");
 return db.transaction(async tx=>{
  const [item]=await tx.select().from(actions).where(and(eq(actions.id,actionId),eq(actions.type,"section_waitlist")))
   .limit(1).for("update");
  if(!item||!item.sectionId||!["waiting","open"].includes(item.status))throw new Error("Waiting student not found");
  const section=await authorizedSection(tx,context,item.sectionId);
  if(!section.active)throw new Error("Class is closed");
  await assertOpenEnrollmentSeat(tx,section.id);
  await tx.update(actions).set({status:"in_progress",dueAt:expiresAt,
    metadata:{...item.metadata,offerIssuedAt:new Date().toISOString(),offerExpiresAt:expiresAt.toISOString()},
    updatedAt:new Date()}).where(eq(actions.id,item.id));
  await journal(tx,context,section,EventTypes.SectionWaitlistSeatOffered,{},
    {actionId:item.id,studentProfileId:item.subjectId,expiresAt:expiresAt.toISOString()});
  return {actionId:item.id,expiresAt:expiresAt.toISOString()};
 });
}

/** Reopen unclaimed expired offers so the next student can be considered. */
export async function expireWaitlistOffers(context: LifecycleContext,programId:string) {
 assertCapability(context,"program.launch.start");
 assertProgramScope(context,programId);
 const [program]=await db.select({id:programs.id,organizationId:programs.organizationId}).from(programs)
  .where(eq(programs.id,programId)).limit(1);
 if(!program||!context.scope.organizationIds?.includes(program.organizationId))
  throw new AuthorizationError("program");
 const expired=await db.select({id:actions.id}).from(actions)
  .where(and(eq(actions.programId,programId),eq(actions.type,"section_waitlist"),
   eq(actions.status,"in_progress"),sql`due_at < now()`));
 let count=0;
 for(const item of expired){
  await db.transaction(async tx=>{
   const [current]=await tx.select().from(actions).where(eq(actions.id,item.id)).limit(1).for("update");
   if(!current||current.status!=="in_progress"||!current.dueAt||current.dueAt>new Date()||!current.sectionId)return;
   const section=await authorizedSection(tx,context,current.sectionId);
   await tx.update(actions).set({status:"waiting",dueAt:null,
    metadata:{...current.metadata,offerExpiredAt:new Date().toISOString()},updatedAt:new Date()})
    .where(eq(actions.id,current.id));
   await journal(tx,context,section,EventTypes.SectionWaitlistOfferExpired,{}, {actionId:current.id});
   count++;
  });
 }
 return {expired:count};
}

/** Internal maintenance task invoked only from the authenticated scheduled-job entrypoint. */
export async function expireOutstandingSectionOffers(limit=100):Promise<number>{
 const pending=await db.select({id:actions.id}).from(actions).where(and(
  eq(actions.type,"section_waitlist"),eq(actions.status,"in_progress"),
  sql`due_at is not null and due_at < now()`)).limit(limit);
 let expired=0;
 for(const pendingItem of pending){
  await db.transaction(async tx=>{
   const [item]=await tx.select().from(actions).where(eq(actions.id,pendingItem.id)).limit(1).for("update");
   if(!item||item.status!=="in_progress"||!item.dueAt||item.dueAt>new Date())return;
   await tx.update(actions).set({status:"waiting",dueAt:null,updatedAt:new Date(),
    metadata:{...item.metadata,offerExpiredAt:new Date().toISOString()}}).where(eq(actions.id,item.id));
   await writeAudit(tx, {action:"SectionWaitlistOfferExpired",resourceType:"action",
    resourceId:item.id,scope:{organizationId:item.organizationId,programId:item.programId,siteId:item.siteId},
    before:{status:"in_progress"},after:{status:"waiting"}});
   expired++;
  });
 }
 return expired;
}
