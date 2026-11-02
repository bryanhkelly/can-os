import { describe,expect,it,vi } from "vitest";
import { and,eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { roleCapabilities } from "@/domain/access-context";
import type { Actor } from "@/modules/identity/actors.server";

type Transaction=Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Transaction|undefined,actor:undefined as Actor|undefined}));
vi.mock("@/db/client",()=>({
 get db(){if(!state.tx)throw new Error("Attendance handoff must stay in its rollback transaction");return state.tx;},
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
 getCommandContext:async()=>{if(!state.actor)throw new Error("Missing attendance actor");return state.actor;},
}));
vi.mock("@/modules/communication/notification-email.server",()=>({
 emailNotificationRecipients:vi.fn(async()=>new Map()),sendNotificationEmail:vi.fn(),
}));
function first<T>(rows:T[]):T{
 const row=rows[0];if(!row)throw new Error("Missing attendance acceptance fixture");return row;
}
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("GF4 cross-role attendance and operational exceptions",()=>{
 it("reconciles corrected attendance and obsolete excuses with calendar changes, retries and current grants",async()=>{
  const {db:database}=await vi.importActual<{db:Database}>("@/db/client");
  const s=await import("@/db/schema");
  const flow=await import("@/modules/attendance/onsite-attendance-workflow.functions");
  const {closeObsoleteAttendanceExcuse,recordAttendanceRevision}=await import("@/modules/attendance/attendance-service");
  const {addStudioCalendarDay,replaceStudioSchedulePeriods}=await import("@/modules/academic-time/school-year-studio.functions");
  const {getFamilyHome,getGuardianNeedsYou}=await import("@/modules/family/family-home.functions");
  const {getNotifications}=await import("@/modules/communication/notification-center.functions");
  const {siteDate}=await import("@/domain/expected-attendance");
  const rollback=new Error("rollback-attendance-handoff");
  const suffix=crypto.randomUUID().slice(0,8);
  const target=new Date();
  target.setUTCDate(target.getUTCDate()-((target.getUTCDay()+5)%7)-7);
  const date=siteDate(target,"America/Los_Angeles");
  const year=date.slice(0,4);
  let studentId="",excuseId="",originalId="";
  let checked=false;
  try{
   await database.transaction(async tx=>{
    state.tx=tx;
    const org=first(await tx.insert(s.organizations).values({type:"christian_school",
     name:"Attendance acceptance",slug:`attendance-handoff-${suffix}`}).returning());
    const site=first(await tx.insert(s.sites).values({organizationId:org.id,name:"Attendance site",
     timezone:"America/Los_Angeles",slug:`attendance-handoff-${suffix}`}).returning());
    const jurisdiction=first(await tx.insert(s.jurisdictions).values({
     code:`attendance-handoff-${suffix}`,name:"Synthetic attendance jurisdiction"}).returning());
    const program=first(await tx.insert(s.programs).values({organizationId:org.id,siteId:site.id,
     jurisdictionId:jurisdiction.id,type:"full_school",status:"active",name:"Attendance Academy",
     slug:`attendance-handoff-${suffix}`,gradeRange:{min:"6",max:"12"},deliveryModel:{onsite:true},
     academicProviderOrganizationId:org.id,creditIssuingOrganizationId:org.id}).returning());
    const scale=first(await tx.insert(s.gradeScales).values({owningOrganizationId:org.id,
     name:"Attendance test scale",version:1,configuration:{entries:[{label:"Pass",passing:true}]}}).returning());
    const schoolYear=first(await tx.insert(s.schoolYears).values({organizationId:org.id,siteId:site.id,
     programId:program.id,key:suffix,name:"Attendance year",status:"active",startsOn:`${year}-01-01`,
     endsOn:`${year}-12-31`,gradeScaleId:scale.id}).returning());
    const term=first(await tx.insert(s.terms).values({schoolYearId:schoolYear.id,key:suffix,name:"Attendance term",
     sequence:1,startsOn:schoolYear.startsOn,endsOn:schoolYear.endsOn}).returning());
    const calendar=first(await tx.insert(s.academicCalendars).values({schoolYearId:schoolYear.id,siteId:site.id,
     name:"Attendance calendar",version:1,active:true}).returning());
    await tx.insert(s.academicCalendarDays).values({academicCalendarId:calendar.id,calendarDate:date,type:"instructional",instructionalMinutes:360});
    const schedule=first(await tx.insert(s.scheduleTemplates).values({schoolYearId:schoolYear.id,programId:program.id,
     siteId:site.id,name:"Onsite day",effectiveFrom:schoolYear.startsOn,active:true}).returning());
    await tx.insert(s.scheduleTemplatePeriods).values({scheduleTemplateId:schedule.id,dayOfWeek:new Date(date+"T12:00:00Z").getUTCDay(),
     sequence:1,label:"Instruction",startsAtLocal:"08:30",endsAtLocal:"15:00",type:"instruction"});
    const learner=first(await tx.insert(s.people).values({legalFirstName:"Attendance",legalLastName:"Learner"}).returning());
    const guardian=first(await tx.insert(s.people).values({legalFirstName:"Attendance",legalLastName:"Guardian"}).returning());
    const teacher=first(await tx.insert(s.people).values({legalFirstName:"Attendance",legalLastName:"Teacher"}).returning());
    const registrar=first(await tx.insert(s.people).values({legalFirstName:"Attendance",legalLastName:"Registrar"}).returning());
    const facilitator=first(await tx.insert(s.people).values({legalFirstName:"Onsite",legalLastName:"Facilitator"}).returning());
    const siteLeader=first(await tx.insert(s.people).values({legalFirstName:"Site",legalLastName:"Leader"}).returning());
    const outsider=first(await tx.insert(s.people).values({legalFirstName:"Other",legalLastName:"Guardian"}).returning());
    const student=first(await tx.insert(s.studentProfiles).values({personId:learner.id,gradeLevel:"9"}).returning());
    studentId=student.id;
    // The first-day checkpoint reuses the real accepted Application and
    // student/Program membership, not a separate onboarding record.
    const household=first(await tx.insert(s.households).values({
      displayName:"Attendance handoff family",
    }).returning());
    const application=first(await tx.insert(s.applications).values({
      householdId:household.id,studentProfileId:student.id,programId:program.id,
      stage:"accepted",submittedByPersonId:guardian.id,
      idempotencyKey:`first-day-${suffix}`,
      metadata:{schoolYearId:schoolYear.id},
    }).returning());
    const relation=first(await tx.insert(s.guardianRelationships).values({guardianPersonId:guardian.id,
     studentPersonId:learner.id,relationshipLabel:"parent",canViewAcademics:true,canSubmitAttendanceExcuse:true}).returning());
    const course=first(await tx.insert(s.courseTemplates).values({owningOrganizationId:org.id,code:suffix,title:"Attendance Science",subject:"Science"}).returning());
    const version=first(await tx.insert(s.courseTemplateVersions).values({courseTemplateId:course.id,version:1,status:"published"}).returning());
    const section=first(await tx.insert(s.sections).values({programId:program.id,siteId:site.id,termId:term.id,
     courseTemplateVersionId:version.id,code:suffix,title:"Attendance Science"}).returning());
    const assignment=first(await tx.insert(s.sectionTeachers).values({sectionId:section.id,personId:teacher.id}).returning());
    await tx.insert(s.enrollments).values([
     {studentProfileId:student.id,kind:"program",status:"active",organizationId:org.id,programId:program.id,schoolYearId:schoolYear.id},
     {studentProfileId:student.id,kind:"section",status:"active",organizationId:org.id,programId:program.id,schoolYearId:schoolYear.id,sectionId:section.id},
    ]);
    function act(role:"registrar"|"teacher"|"guardian"|"room_facilitator"|"site_leader",personId:string):Actor{
     const actor:Actor={actorPersonId:personId,role,accountId:crypto.randomUUID(),sessionId:crypto.randomUUID(),
      grantId:crypto.randomUUID(),grantSiteId:site.id,capabilities:new Set(roleCapabilities[role]),
      scope:{organizationIds:[org.id],siteIds:[site.id],programIds:[program.id]}};
     state.actor=actor;return actor;
    }
    const leadAccount=first(await tx.insert(s.accessAccounts).values({
      emailNormalized:`site-lead-${suffix}@example.test`,
    }).returning());
    await tx.insert(s.accountPersonGrants).values({
      accountId:leadAccount.id,personId:siteLeader.id,
      role:"site_leader",siteId:site.id,organizationId:org.id,
      active:true,});
    const staff=act("registrar",registrar.id);
    // Even with the right Section UUID, an enrollment in the wrong academic
    // year cannot be used to claim a supervised attendance record.
    const [sectionSeat]=await tx.select({id:s.enrollments.id})
      .from(s.enrollments).where(and(
        eq(s.enrollments.studentProfileId,student.id),
        eq(s.enrollments.sectionId,section.id),
        eq(s.enrollments.kind,"section"),
      ));
    if(!sectionSeat)throw new Error("Missing Section seat in attendance fixture");
    await tx.update(s.enrollments).set({schoolYearId:null})
      .where(eq(s.enrollments.id,sectionSeat.id));
    await expect(recordAttendanceRevision(staff,{
      studentProfileId:student.id,programId:program.id,siteId:site.id,
      sectionId:section.id,occurrenceKey:date+":site-day",
      status:"present",expectedAt:new Date(date+"T12:00:00Z"),
      mutationId:crypto.randomUUID(),requireExpectedOnsiteDate:date,
    })).rejects.toThrow("student not assigned to section");
    await tx.update(s.enrollments).set({schoolYearId:schoolYear.id})
      .where(eq(s.enrollments.id,sectionSeat.id));

    // Hybrid planning reads the already-configured instructional schedule,
    // current facilitator assignment, and a REAL non-synthetic staff grant.
    await tx.update(s.sections).set({scheduleTemplateId:schedule.id})
      .where(eq(s.sections.id,section.id));
    const staffAccount=first(await tx.insert(s.accessAccounts).values({
      emailNormalized:`facilitator-${suffix}@example.test`,
    }).returning());
    await tx.insert(s.accountPersonGrants).values({
      accountId:staffAccount.id,personId:facilitator.id,
      role:"room_facilitator",siteId:site.id,organizationId:org.id,
      active:true,});
    await tx.insert(s.deliveryArrangements).values({
      sectionId:section.id,academicProviderOrganizationId:org.id,
      instructorPersonId:teacher.id,facilitatorPersonId:facilitator.id,
      status:"active",modality:"hybrid",
      effectiveFrom:new Date(date+"T00:00:00Z".replace("Z","Z")),
      effectiveThrough:new Date(new Date(date+"T00:00:00Z").getTime()+7*86400_000),
    });
    // Cover both the historical attendance fixture and a distinct scheduled
    // TODAY duty, without fabricating a backdated staffing acknowledgment.
    await tx.update(s.deliveryArrangements).set({
      effectiveFrom:new Date(new Date(date+"T00:00:00Z").getTime()-7*86400_000),
      effectiveThrough:new Date(Date.now()+10*86400_000),
    }).where(eq(s.deliveryArrangements.sectionId,section.id));
    const todaySite=siteDate(new Date(),"America/Los_Angeles");
    if(todaySite!==date){
      await tx.insert(s.academicCalendarDays).values({
        academicCalendarId:calendar.id,calendarDate:todaySite,
        type:"instructional",instructionalMinutes:360,
      });
    }
    const todayWeekday=new Date(todaySite+"T12:00:00Z").getUTCDay();
    const originalWeekday=new Date(date+"T12:00:00Z").getUTCDay();
    if(todayWeekday!==originalWeekday){
      await tx.insert(s.scheduleTemplatePeriods).values({
        scheduleTemplateId:schedule.id,dayOfWeek:todayWeekday,
        sequence:1,label:"Instruction",startsAtLocal:"08:30",
        endsAtLocal:"15:00",type:"instruction",
      });
    }
    const supervisorActor=act("room_facilitator",facilitator.id);
    const supervision=await import("@/modules/operations/onsite-supervision.functions");
    const sitePlan=await supervision.getOnsiteSupervisionPlan({data:{date}});
    expect(sitePlan.plannedAssignments).toBe(1);
    expect(sitePlan.hasConfirmedPhysicalCoverage).toBe(false);
    expect(sitePlan.blocks[0]).toMatchObject({
      sectionId:section.id,programId:program.id,
      facilitatorName:"Onsite Facilitator",assignedPlan:true,
      gaps:["room_unconfigured"],
    });
    const duty=await import("@/modules/operations/onsite-duty-response.functions");
    const todaysPlan=await supervision.getOnsiteSupervisionPlan({data:{date:todaySite}});
    const assignedBlock=first(todaysPlan.blocks.filter(block=>block.canRespond));
    expect(assignedBlock.canAccept).toBe(true);
    const dutyRequest={
      date:todaySite,sectionId:assignedBlock.sectionId,
      periodId:assignedBlock.periodId!,
      response:"accepted" as const,confirmed:true as const,
    };
    const initialDuty=await duty.getOnsiteDutyResponses({data:{date:todaySite}});
    expect(initialDuty.statuses.find(block=>block.sectionId===assignedBlock.sectionId &&
      block.periodId===assignedBlock.periodId)?.status).toBe("not_reported");
    const dutyResponse=await duty.respondToOnsiteDuty({data:dutyRequest});
    expect(dutyResponse.created).toBe(true);
    expect(await duty.respondToOnsiteDuty({data:dutyRequest})).toEqual({
      responseId:dutyResponse.responseId,created:false,response:"accepted",
    });
    expect((await duty.getOnsiteDutyResponses({data:{date:todaySite}}))
      .statuses.find(block=>block.sectionId===assignedBlock.sectionId &&
        block.periodId===assignedBlock.periodId)?.status).toBe("accepted");
    await expect(duty.respondToOnsiteDuty({data:{
      ...dutyRequest,response:"cannot_cover",reason:"unavailable",
    }})).rejects.toThrow("duty already answered");
    // Regression: a repeating weekly timetable alone cannot justify duty
    // acknowledgment when the current academic calendar closes the site.
    await tx.update(s.academicCalendarDays).set({
      type:"closure",instructionalMinutes:0,
    }).where(and(eq(s.academicCalendarDays.academicCalendarId,calendar.id),
      eq(s.academicCalendarDays.calendarDate,todaySite)));
    const closedPlan=await supervision.getOnsiteSupervisionPlan({data:{date:todaySite}});
    expect(closedPlan.blocks[0]).toMatchObject({
      instructionalDayConfirmed:false,assignedPlan:false,canRespond:false,
      canAccept:false,
    });
    expect(closedPlan.blocks[0]?.gaps).toContain("calendar_unverified");
    const staleDuty=await duty.getOnsiteDutyResponses({data:{date:todaySite}});
    expect(staleDuty.statuses[0]).toMatchObject({
      status:"not_reported",canRespond:false,canAccept:false,
    });
    expect(staleDuty.unacknowledged).toBe(0); // closure is NOT missed duty
    expect(staleDuty.coverageExceptions).toBe(0);
    await expect(duty.respondToOnsiteDuty({data:dutyRequest}))
      .rejects.toThrow("current named onsite duty assignment");
    await tx.update(s.academicCalendarDays).set({
      type:"instructional",instructionalMinutes:360,
    }).where(and(eq(s.academicCalendarDays.academicCalendarId,calendar.id),
      eq(s.academicCalendarDays.calendarDate,todaySite)));
    expect((await duty.getOnsiteDutyResponses({data:{date:todaySite}}))
      .statuses[0]?.status).toBe("accepted");
    state.actor={...supervisorActor,grantSiteId:crypto.randomUUID()};
    await expect(supervision.getOnsiteSupervisionPlan({data:{date}}))
      .rejects.toThrow("site-bound");
    await expect(duty.respondToOnsiteDuty({data:dutyRequest}))
      .rejects.toThrow("site-bound");
    const differentStaff=act("site_leader",siteLeader.id);
    await expect(duty.respondToOnsiteDuty({data:dutyRequest}))
      .rejects.toThrow("current named onsite duty assignment");
    state.actor=differentStaff;
    await expect(duty.respondToOnsiteDuty({data:{
      ...dutyRequest,date,
    }})).rejects.toThrow("only today's scheduled duty");
    state.actor=staff;
    // Same enrolled child, current calendar, roster and independently reviewed
    // staffing projection. No implicit attendance or onsite opening approval.
    const firstDay=await import("@/modules/enrollment/first-school-day-handoff.functions");
    const beforeStart=await firstDay.getFirstSchoolDayHandoff({
      data:{applicationId:application.id},
    });
    expect(beforeStart).toMatchObject({
      date:todaySite,state:"supervision_unverified",studentExpected:true,
      supervisionPlanned:false,attendanceRecorded:false,
    });
    expect(beforeStart.outstandingGaps).toContain("room_unconfigured");
    state.actor={...staff,scope:{...staff.scope,siteIds:[]}};
    await expect(firstDay.getFirstSchoolDayHandoff({
      data:{applicationId:application.id},
    })).rejects.toThrow("scope");
    state.actor=staff;
    // Preserve a staff-observed fact without misrepresenting outstanding
    // room/backup requirements as cleared or physical supervision proven.
    await flow.markExpectedOnsiteAttendance({data:{
      date:todaySite,studentProfileId:student.id,programId:program.id,
      status:"present",mutationId:crypto.randomUUID(),
      expectedPreviousEventId:null,
    }});
    expect(await firstDay.getFirstSchoolDayHandoff({
      data:{applicationId:application.id},
    })).toMatchObject({
      state:"supervision_unverified",studentExpected:true,
      supervisionPlanned:false,attendanceRecorded:true,
    });
    expect(first((await flow.listExpectedOnsiteRoster({data:{date}})).students).status).toBe("unmarked");
    const onsiteReview=await import("@/modules/operations/onsite-day-review.functions");
    const lead=act("site_leader",siteLeader.id);
    expect((await onsiteReview.getOnsiteDayReview({data:{date}}))
      .readyForAttendanceReview).toBe(false);
    await expect(onsiteReview.attestOnsiteDayReview({data:{
      date,confirmedRecordsReviewed:true,
    }})).rejects.toThrow("Unmarked attendance");
    state.actor=staff;
    const taught=act("teacher",teacher.id);
    const absent={date,studentProfileId:student.id,programId:program.id,status:"absent" as const,
     mutationId:crypto.randomUUID(),expectedPreviousEventId:null};
    const original=await flow.markExpectedOnsiteAttendance({data:absent});originalId=original.attendanceEventId;
    expect(await flow.markExpectedOnsiteAttendance({data:absent})).toEqual(original);
    state.actor=lead;
    expect(await onsiteReview.getOnsiteDayReview({data:{date}})).toMatchObject({
      status:"not_reviewed",canAttest:true,readyForAttendanceReview:true,
      unresolvedIssues:0,
    });
    const dayReviewed=await onsiteReview.attestOnsiteDayReview({data:{
      date,confirmedRecordsReviewed:true,
    }});
    expect(dayReviewed.created).toBe(true);
    expect(await onsiteReview.attestOnsiteDayReview({data:{
      date,confirmedRecordsReviewed:true,
    }})).toMatchObject({reviewId:dayReviewed.reviewId,created:false});
    expect((await onsiteReview.getOnsiteDayReview({data:{date}})).status)
      .toBe("reviewed_snapshot");
    state.actor=taught;
    await expect(onsiteReview.attestOnsiteDayReview({data:{
      date,confirmedRecordsReviewed:true,
    }})).rejects.toThrow();
    state.actor=staff;
    const reviewAction=first(await tx.select().from(s.actions)
      .where(eq(s.actions.id,dayReviewed.reviewId)));
    expect(reviewAction.metadata).toMatchObject({
      date,expectedEntries:1,markedEntries:1,scope:"attendance_snapshot_only",
    });


    // The facilitator is physically assigned to this site, not a registrar.
    // Their attendance event goes through the same authoritative ledger.
    const room=act("room_facilitator",facilitator.id);
    const siteDay=await flow.getOnsiteStaffDayContext();
    expect(siteDay).toMatchObject({siteId:site.id,siteName:site.name});
    expect(first((await flow.listExpectedOnsiteRoster({data:{date}})).students))
      .toMatchObject({studentProfileId:student.id,attendanceEventId:originalId,status:"absent"});
    await expect(flow.listExpectedPendingExcuses()).rejects.toThrow("onsite staff cannot review");
    await expect(flow.markExpectedOnsiteAttendance({data:{
      ...absent,mutationId:crypto.randomUUID(),
    }})).rejects.toThrow("prior-record acknowledgement");
    await expect(flow.markExpectedOnsiteAttendance({data:{
      ...absent,expectedPreviousEventId:originalId,
      mutationId:crypto.randomUUID(),note:"too short",
    }})).rejects.toThrow("Explain any onsite attendance correction");
    expect(await flow.markExpectedOnsiteAttendance({data:{
      ...absent,expectedPreviousEventId:originalId,
      mutationId:crypto.randomUUID(),note:"I verified the original absence.",
    }})).toEqual(original);
    state.actor={...room,grantSiteId:crypto.randomUUID()};
    await expect(flow.markExpectedOnsiteAttendance({data:{
      ...absent,expectedPreviousEventId:originalId,
      mutationId:crypto.randomUUID(),note:"Original mark reviewed.",
    }})).rejects.toThrow("site-bound");
    state.actor=room;
    await expect(recordAttendanceRevision(room,{
      studentProfileId:student.id,programId:program.id,siteId:site.id,sectionId:section.id,
      occurrenceKey:date+":site-day",expectedAt:new Date(),status:"present",
      mutationId:crypto.randomUUID(),expectedPreviousEventId:originalId,
    })).rejects.toThrow("scheduled site-day");
    const family=act("guardian",guardian.id);
    expect(first((await getFamilyHome()).children).unexcusedAbsences).toBe(1);
    expect((await getGuardianNeedsYou()).items.filter(row=>row.kind==="excuse")).toHaveLength(1);
    expect((await getNotifications()).find(row=>row.title==="Attendance needs your attention")?.href).toContain(originalId);
    const submitted=await flow.submitEffectiveAttendanceExcuse({data:{attendanceEventId:originalId,reason:"Medical appointment"}});
    excuseId=submitted.excuseId;
    state.actor=staff;
    const currentClosure={excuseId,expectedCurrentEventId:originalId,reason:"Attendance was corrected after the family submitted.",confirmed:true as const};
    await expect(flow.closeStaleAttendanceExcuse({data:currentClosure})).rejects.toThrow("current attendance record");
    const correction={...absent,status:"present" as const,mutationId:crypto.randomUUID(),expectedPreviousEventId:originalId};
    await addStudioCalendarDay({data:{academicCalendarId:calendar.id,calendarDate:date,type:"closure",title:"School closed"}});
    expect((await flow.listExpectedOnsiteRoster({data:{date}})).students).toEqual([]);
    await expect(flow.markExpectedOnsiteAttendance({data:correction})).rejects.toThrow("No authorized scheduled");
    const persisted=first(await tx.select().from(s.attendanceEvents).where(eq(s.attendanceEvents.id,originalId)));
    await expect(recordAttendanceRevision(staff,{
     studentProfileId:student.id,programId:program.id,siteId:site.id,sectionId:section.id,
     occurrenceKey:persisted.occurrenceKey,expectedAt:persisted.expectedAt,status:"present",
     mutationId:crypto.randomUUID(),expectedPreviousEventId:originalId,requireExpectedOnsiteDate:date,
    })).rejects.toThrow("not scheduled onsite");
    // A committed device operation remains replayable after configuration changes.
    expect(await flow.markExpectedOnsiteAttendance({data:absent})).toEqual(original);
    await addStudioCalendarDay({data:{academicCalendarId:calendar.id,calendarDate:date,type:"instructional",instructionalMinutes:360}});
    const period={dayOfWeek:new Date(date+"T12:00:00Z").getUTCDay(),sequence:1,label:"Instruction",
     startsAtLocal:"08:30",endsAtLocal:"15:00",type:"instruction" as const};
    await expect(replaceStudioSchedulePeriods({data:{scheduleTemplateId:schedule.id,
     periods:[{...period,startsAtLocal:"25:00"}]}})).rejects.toThrow();
    await replaceStudioSchedulePeriods({data:{scheduleTemplateId:schedule.id,periods:[{...period,type:"break"}]}});
    expect((await flow.listExpectedOnsiteRoster({data:{date}})).students).toEqual([]);
    await expect(flow.markExpectedOnsiteAttendance({data:correction})).rejects.toThrow("No authorized scheduled");
    await replaceStudioSchedulePeriods({data:{scheduleTemplateId:schedule.id,periods:[period]}});
    const present=await flow.markExpectedOnsiteAttendance({data:correction});
    state.actor=lead;
    expect((await onsiteReview.getOnsiteDayReview({data:{date}})).status)
      .toBe("stale_after_changes");
    state.actor=staff;
    await expect(flow.markExpectedOnsiteAttendance({data:{...absent,mutationId:crypto.randomUUID()}})).rejects.toThrow("Attendance conflict");
    await expect(flow.reviewCurrentAttendanceExcuse({data:{excuseId,decision:"approved"}})).rejects.toThrow("Attendance changed");
    const pending=first((await flow.listExpectedPendingExcuses()).excuses);
    expect(pending).toMatchObject({excuseId,canReview:false,canClose:true,currentAttendanceEventId:present.attendanceEventId});
    const closure={...currentClosure,expectedCurrentEventId:present.attendanceEventId};
    state.actor=taught;
    expect(first((await flow.listExpectedPendingExcuses()).excuses).canClose).toBe(false);
    await expect(flow.closeStaleAttendanceExcuse({data:closure})).rejects.toThrow("registrar");
    await expect(closeObsoleteAttendanceExcuse(taught,closure)).rejects.toThrow("registrar");
    state.actor=family;
    await expect(flow.closeStaleAttendanceExcuse({data:closure})).rejects.toThrow();
    state.actor=staff;
    for(const scope of [{...staff.scope,programIds:[]},{...staff.scope,siteIds:[]},{...staff.scope,organizationIds:[]}]){
     await expect(closeObsoleteAttendanceExcuse({...staff,scope},closure)).rejects.toThrow("scope");
    }
    state.actor={...staff,capabilities:new Set()};
    await expect(flow.closeStaleAttendanceExcuse({data:closure})).rejects.toThrow();
    state.actor=staff;
    await expect(flow.closeStaleAttendanceExcuse({data:{...closure,confirmed:false}})).rejects.toThrow();
    await expect(flow.closeStaleAttendanceExcuse({data:{...closure,reason:"short"}})).rejects.toThrow();
    await expect(flow.closeStaleAttendanceExcuse({data:currentClosure})).rejects.toThrow("Attendance conflict");
    const before=await tx.select().from(s.attendanceEvents).where(eq(s.attendanceEvents.studentProfileId,student.id));
    await flow.closeStaleAttendanceExcuse({data:closure});
    await flow.closeStaleAttendanceExcuse({data:closure});
    await expect(flow.closeStaleAttendanceExcuse({data:{...closure,reason:"Different closure reason on retry"}})).rejects.toThrow("different input");
    expect(await tx.select().from(s.attendanceEvents).where(eq(s.attendanceEvents.studentProfileId,student.id))).toEqual(before);
    expect((await flow.listExpectedPendingExcuses()).excuses).toEqual([]);
    state.actor=family;
    const corrected=first((await flow.listGuardianEffectiveAbsences({data:{}})).absences);
    expect(corrected).toMatchObject({status:"present",excuse:null,
     historicalExcuses:[{excuseId,status:"withdrawn",reviewNote:closure.reason}]});
    expect(corrected.relatedAttendanceEventIds).toContain(originalId);
    expect(first((await getFamilyHome()).children).unexcusedAbsences).toBe(0);
    expect((await getGuardianNeedsYou()).items.filter(row=>row.kind==="excuse")).toEqual([]);
    const notices=await getNotifications();
    expect(notices.filter(row=>row.title==="Attendance excuse closed after a correction")).toHaveLength(1);
    expect(notices.find(row=>row.title==="Attendance excuse closed after a correction")?.href).toContain(originalId);
    await tx.update(s.guardianRelationships).set({canViewAcademics:false}).where(eq(s.guardianRelationships.id,relation.id));
    expect((await getNotifications()).find(row=>row.title==="Attendance excuse closed after a correction")?.href).toBeNull();
    expect((await flow.listGuardianEffectiveAbsences({data:{}})).absences).toEqual([]);
    await tx.update(s.guardianRelationships).set({canViewAcademics:true}).where(eq(s.guardianRelationships.id,relation.id));
    act("guardian",outsider.id);
    expect((await flow.listGuardianEffectiveAbsences({data:{}})).absences).toEqual([]);
    await expect(flow.submitEffectiveAttendanceExcuse({data:{attendanceEventId:originalId,reason:"Not my student"}})).rejects.toThrow();
    state.actor=taught;
    const second=await flow.markExpectedOnsiteAttendance({data:{...absent,mutationId:crypto.randomUUID(),expectedPreviousEventId:present.attendanceEventId}});
    state.actor=family;
    expect(first((await getFamilyHome()).children).unexcusedAbsences).toBe(1);
    expect(first((await flow.listGuardianEffectiveAbsences({data:{}})).absences).excuse).toBeNull();
    state.actor=staff;
    const fixed=await flow.markExpectedOnsiteAttendance({data:{...correction,mutationId:crypto.randomUUID(),expectedPreviousEventId:second.attendanceEventId}});
    state.actor=family;
    expect(first((await getFamilyHome()).children).unexcusedAbsences).toBe(0);
    expect((await getGuardianNeedsYou()).items.filter(row=>row.kind==="excuse")).toEqual([]);
    state.actor=taught;
    const tardy=await flow.markExpectedOnsiteAttendance({data:{...absent,status:"tardy",mutationId:crypto.randomUUID(),expectedPreviousEventId:fixed.attendanceEventId}});
    state.actor=family;
    const fresh=await flow.submitEffectiveAttendanceExcuse({data:{attendanceEventId:tardy.attendanceEventId,reason:"Transport was delayed"}});
    state.actor=staff;
    const approved=await flow.reviewCurrentAttendanceExcuse({data:{excuseId:fresh.excuseId,decision:"approved",note:"Reviewed transport delay"}});
    expect(await flow.reviewCurrentAttendanceExcuse({data:{excuseId:fresh.excuseId,decision:"approved",note:"Reviewed transport delay"}})).toEqual(approved);
    await expect(flow.closeStaleAttendanceExcuse({data:{...closure,excuseId:fresh.excuseId}})).rejects.toThrow("submitted obsolete");
    state.actor=taught;
    expect(first((await flow.listExpectedOnsiteRoster({data:{date}})).students).status).toBe("excused");
    await tx.delete(s.sectionTeachers).where(eq(s.sectionTeachers.id,assignment.id));
    await expect(flow.markExpectedOnsiteAttendance({data:absent})).rejects.toThrow("replay assignment");
    state.actor=family;
    expect(first((await flow.listGuardianEffectiveAbsences({data:{}})).absences)).toMatchObject({status:"excused",excuse:{status:"approved"}});
    expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,excuseId),
     eq(s.auditEvents.action,"attendance.excuse.withdraw")))).toHaveLength(1);
    expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,excuseId),
     eq(s.domainEvents.eventType,"AttendanceExcuseWithdrawn")))).toHaveLength(1);
    expect(await tx.select().from(s.notifications).where(and(eq(s.notifications.resourceId,originalId),
     eq(s.notifications.type,"attendance_excuse_withdrawn")))).toHaveLength(1);
    checked=true;throw rollback;
   });
  }catch(error){if(error!==rollback)throw error;}
  finally{state.tx=undefined;state.actor=undefined;}
  expect(checked).toBe(true);
  expect(await database.select().from(s.studentProfiles).where(eq(s.studentProfiles.id,studentId))).toEqual([]);
  expect(await database.select().from(s.attendanceEvents).where(eq(s.attendanceEvents.id,originalId))).toEqual([]);
  expect(await database.select().from(s.attendanceExcuses).where(eq(s.attendanceExcuses.id,excuseId))).toEqual([]);
  expect(await database.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,excuseId),
   eq(s.auditEvents.action,"attendance.excuse.withdraw")))).toEqual([]);
 },180_000);
});
