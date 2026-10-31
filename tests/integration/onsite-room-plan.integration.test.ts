import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { roleCapabilities } from "@/domain/access-context";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Tx|undefined,actor:undefined as AccessContext|undefined}));
vi.mock("@/db/client",()=>({get db(){if(!state.tx)throw new Error("Rollback transaction required");return state.tx;}}));
vi.mock("@tanstack/react-start",()=>({createServerOnlyFn:(fn:unknown)=>fn,
  createServerFn:()=>({parse:(value:unknown)=>value,validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
    handler(fn:(value:{data:unknown})=>unknown){return(value:{data:unknown})=>fn({data:this.parse(value.data)});}})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>{if(!state.actor)throw new Error("Fixture actor required");return state.actor;}}));
// This fixture exercises canonical schedule, plan history and independent
// reviewer authority. Adult eligibility has its own real service coverage;
// unit tests verify review invokes both appointment and safety gates.
vi.mock("@/modules/operations/section-coverage-verification.server",()=>({
  verifiedScheduledSectionFacilitators:async()=>new Map(),scheduledBlockHasNamedFacilitator:()=>true,
}));
vi.mock("@/modules/operations/onsite-block-safety.server",()=>({requireCurrentOnsiteAdultSafety:vi.fn(),
  verifiedAdultSafetyEvidence:async()=>new Map(),verifiedAdultCoversBlock:()=>({screening:false,training:false})}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireChurchHostedOperatingServices:vi.fn()}));
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("canonical room-plan lifecycle",()=>{
  it("uses the latest calendar and preserves independent review and replacement history",async()=>{
    const {db:realDb}=await vi.importActual<{db:Database}>("@/db/client");
    const s=await import("@/db/schema");
    const {submitOnsiteRoomPlan,reviewOnsiteRoomPlan,getOnsiteRoomPlanning}=await import("@/modules/operations/onsite-room-plan.server");
    const {parseVerifiedRoomPlan}=await import("@/modules/operations/onsite-block-room-plan.server");
    const rollback=new Error("rollback-room-plans");let checked=false;
    try{await realDb.transaction(async tx=>{
      state.tx=tx;const suffix=crypto.randomUUID();
      const date=new Date(Date.now()+86400_000).toISOString().slice(0,10),year=date.slice(0,4);
      const [church]=await tx.insert(s.organizations).values({type:"church",name:"Synthetic host",slug:"room-host-"+suffix}).returning();
      const [can]=await tx.insert(s.organizations).values({type:"can_network",name:"Synthetic CAN",slug:"room-can-"+suffix}).returning();
      const [site]=await tx.insert(s.sites).values({organizationId:church!.id,name:"Synthetic Site",slug:suffix,timezone:"UTC"}).returning();
      const [jurisdiction]=await tx.insert(s.jurisdictions).values({code:suffix,name:"Synthetic jurisdiction"}).returning();
      const [program]=await tx.insert(s.programs).values({organizationId:church!.id,hostOrganizationId:church!.id,
        siteId:site!.id,jurisdictionId:jurisdiction!.id,academicProviderOrganizationId:can!.id,
        name:"Synthetic school",slug:suffix,type:"full_school",status:"active",gradeRange:{min:"1",max:"12"},deliveryModel:{onsite:true}}).returning();
      const [configuration]=await tx.insert(s.schoolConfigurationVersions).values({programId:program!.id,version:1,deploymentModel:"church_hosted",
        config:{grades:{min:"1",max:"12"},delivery:{onsite:true,asynchronous:false,liveOnline:false},services:["onsite_supervision"]}}).returning();
      const [scale]=await tx.insert(s.gradeScales).values({owningOrganizationId:church!.id,name:"Synthetic scale",version:1,configuration:{}}).returning();
      const [schoolYear]=await tx.insert(s.schoolYears).values({organizationId:church!.id,siteId:site!.id,programId:program!.id,
        key:suffix,name:"Synthetic year",status:"active",startsOn:year+"-01-01",endsOn:year+"-12-31",gradeScaleId:scale!.id}).returning();
      const [term]=await tx.insert(s.terms).values({schoolYearId:schoolYear!.id,key:suffix,name:"Synthetic term",sequence:1,
        startsOn:schoolYear!.startsOn,endsOn:schoolYear!.endsOn}).returning();
      const [schedule]=await tx.insert(s.scheduleTemplates).values({schoolYearId:schoolYear!.id,siteId:site!.id,programId:program!.id,
        name:"Synthetic schedule",effectiveFrom:schoolYear!.startsOn,active:true}).returning();
      const [period]=await tx.insert(s.scheduleTemplatePeriods).values({scheduleTemplateId:schedule!.id,
        dayOfWeek:new Date(date+"T12:00:00Z").getUTCDay(),sequence:1,label:"Instruction",type:"instruction",startsAtLocal:"09:00",endsAtLocal:"10:00"}).returning();
      const [course]=await tx.insert(s.courseTemplates).values({owningOrganizationId:church!.id,code:suffix,title:"Synthetic class",subject:"Science"}).returning();
      const [version]=await tx.insert(s.courseTemplateVersions).values({courseTemplateId:course!.id,version:1,status:"published"}).returning();
      const [section]=await tx.insert(s.sections).values({siteId:site!.id,programId:program!.id,termId:term!.id,
        courseTemplateVersionId:version!.id,scheduleTemplateId:schedule!.id,code:suffix,title:"Synthetic class"}).returning();
      const calendarIds:string[]=[];
      for(const calendarVersion of [1,2]){
        const [calendar]=await tx.insert(s.academicCalendars).values({schoolYearId:schoolYear!.id,siteId:site!.id,
          name:"Synthetic calendar",version:calendarVersion,active:true}).returning();
        calendarIds.push(calendar!.id);
        await tx.insert(s.academicCalendarDays).values({academicCalendarId:calendar!.id,calendarDate:date,
          type:calendarVersion===1?"instructional":"closure",instructionalMinutes:calendarVersion===1?60:0});
      }
      const people=await tx.insert(s.people).values(["host","reviewer","primary","backup","replacement","placedLearner","unplacedLearner"].map(label=>({legalFirstName:"Synthetic",legalLastName:label}))).returning();
      const [originalDelivery]=await tx.insert(s.deliveryArrangements).values({sectionId:section!.id,
        academicProviderOrganizationId:can!.id,facilitatorPersonId:people[2]!.id,modality:"onsite",status:"active"}).returning();
      function actor(role:"registrar"|"can_network_steward",index:number):AccessContext{
        return {role,actorPersonId:people[index]!.id,grantSiteId:role==="registrar"?site!.id:null,
          capabilities:new Set(roleCapabilities[role]),scope:{organizationIds:[role==="registrar"?church!.id:can!.id],
            siteIds:role==="registrar"?[site!.id]:[],programIds:role==="registrar"?[program!.id]:[]}} as AccessContext;
      }
      const host=actor("registrar",0),reviewer=actor("can_network_steward",1);
      const input={programId:program!.id,sectionId:section!.id,periodId:period!.id,date,documentId:crypto.randomUUID(),expectedDocumentId:null,
        primaryPersonId:people[2]!.id,backupPersonId:people[3]!.id,roomLabel:"Classroom A",roomCapacity:20,
        expiresAt:new Date(Date.now()+3*86400_000).toISOString(),rationale:"Synthetic room and named adult plan for isolated verification."};
      await expect(submitOnsiteRoomPlan(host,input)).rejects.toThrow("current scheduled instructional Section");
      await tx.update(s.academicCalendarDays).set({type:"instructional",instructionalMinutes:60}).where(and(eq(s.academicCalendarDays.calendarDate,date),inArray(s.academicCalendarDays.academicCalendarId,calendarIds)));
      expect(await submitOnsiteRoomPlan(host,input)).toMatchObject({created:true});
      const scope={...input,siteId:site!.id,timeZone:"UTC",startsAtLocal:"09:00:00",endsAtLocal:"10:00:00"};
      const read=async(id:string)=>(await tx.select().from(s.documents).where(eq(s.documents.id,id)))[0]!;
      expect(parseVerifiedRoomPlan(await read(input.documentId),scope)).toBeNull();
      const review={programId:input.programId,sectionId:input.sectionId,periodId:input.periodId,date,documentId:input.documentId,
        decision:"approve" as const,reason:"Independent review of this synthetic operational plan."};
      await expect(reviewOnsiteRoomPlan(host,review)).rejects.toThrow("CAN");
      expect(await reviewOnsiteRoomPlan(reviewer,review)).toMatchObject({changed:true});
      expect(parseVerifiedRoomPlan(await read(input.documentId),scope)).not.toBeNull();
      expect(await reviewOnsiteRoomPlan(reviewer,review)).toMatchObject({changed:false});
      const replacement={...input,documentId:crypto.randomUUID(),expectedDocumentId:input.documentId,roomLabel:"Classroom B"};
      expect(await submitOnsiteRoomPlan(host,replacement)).toMatchObject({created:true});
      expect(parseVerifiedRoomPlan(await read(input.documentId),scope)).toBeNull();
      expect(parseVerifiedRoomPlan(await read(replacement.documentId),scope)).toBeNull();
      await reviewOnsiteRoomPlan(reviewer,{...review,documentId:replacement.documentId,decision:"reject",reason:"The proposed room needs a corrected occupancy review."});
      expect((await read(replacement.documentId)).metadata.reviewStatus).toBe("rejected");
      const substitute={...input,documentId:crypto.randomUUID(),expectedDocumentId:replacement.documentId,
        primaryPersonId:people[4]!.id,substitutesForPersonId:people[2]!.id};
      await submitOnsiteRoomPlan(host,substitute);
      expect(parseVerifiedRoomPlan(await read(substitute.documentId),scope)).toBeNull();
      await reviewOnsiteRoomPlan(reviewer,{...review,documentId:substitute.documentId});
      expect(parseVerifiedRoomPlan(await read(substitute.documentId),scope)).toMatchObject({primaryPersonId:people[4]!.id,substitutesForPersonId:people[2]!.id});
      expect((await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.id,originalDelivery!.id)))[0]?.facilitatorPersonId).toBe(people[2]!.id);
      const workspace=await getOnsiteRoomPlanning(reviewer,{programId:program!.id,date});
      expect(workspace.canReview).toBe(true);
      expect(workspace.canSubmit).toBe(false);
      expect(workspace.blocks).toHaveLength(1);
      expect(workspace.blocks[0]?.current).toMatchObject({id:substitute.documentId,status:"approved"});
      const events=await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,input.documentId),eq(s.domainEvents.eventType,"OnsiteRoomPlanReviewed")));
      expect(events).toHaveLength(1);
      // Follow the same director and child from preparing tomorrow into the
      // live roster. Calendar, enrollments, roles and attendance are real DB
      // records; only unrelated agreement/adult-credential services are mocked.
      const [account]=await tx.insert(s.accessAccounts).values({emailNormalized:"director-"+suffix+"@example.invalid",emailVerifiedAt:new Date()}).returning();
      const [grant]=await tx.insert(s.accountPersonGrants).values({accountId:account!.id,personId:people[0]!.id,
        role:"site_leader",organizationId:church!.id,siteId:site!.id}).returning();
      const through=new Date(Date.now()+3*86400_000);
      const [role]=await tx.insert(s.roleAssignments).values({personId:people[0]!.id,organizationId:church!.id,siteId:site!.id,
        programId:program!.id,roleKey:"site_leader",capabilities:["onsite.attendance.record"],
        metadata:{origin:"local_site_delegation",expiresAt:through.toISOString()}}).returning();
      await tx.insert(s.programResponsibilityAssignments).values({configurationVersionId:configuration!.id,responsibilityKey:"site_director",
        accountableOrganizationId:church!.id,responsibleRoleAssignmentId:role!.id,effectiveFrom:new Date(Date.now()-60_000),effectiveThrough:through});
      const learners=await tx.insert(s.studentProfiles).values([5,6].map(index=>({personId:people[index]!.id,gradeLevel:"9"}))).returning();
      await tx.insert(s.enrollments).values([
        ...learners.map(student=>({studentProfileId:student.id,organizationId:church!.id,programId:program!.id,
          schoolYearId:schoolYear!.id,kind:"program" as const,status:"active" as const})),
        {studentProfileId:learners[0]!.id,organizationId:church!.id,programId:program!.id,schoolYearId:schoolYear!.id,
          sectionId:section!.id,kind:"section",status:"active"},
      ]);
      state.actor={...host,role:"site_leader",accountId:account!.id,sessionId:"synthetic",grantId:grant!.id,
        capabilities:new Set(roleCapabilities.site_leader)};
      const {getOnsiteSchoolDayPreparation}=await import("@/modules/operations/onsite-day-preparation.functions");
      const {markExpectedOnsiteAttendance,listExpectedOnsiteRoster}=await import("@/modules/attendance/onsite-attendance-workflow.functions");
      const prep=await getOnsiteSchoolDayPreparation({data:{date}});
      expect(prep.students.map(student=>student.studentProfileId)).toEqual([learners[0]!.id]);
      expect(prep.sectionMemberships).toContainEqual(expect.objectContaining({studentProfileId:learners[0]!.id,sectionId:section!.id}));
      expect(prep.unplacedStudents.map(student=>student.studentProfileId)).toEqual([learners[1]!.id]);
      expect(prep.blocks).toContainEqual(expect.objectContaining({sectionId:section!.id,periodId:period!.id}));
      const observation={date,programId:program!.id,studentProfileId:learners[0]!.id,status:"present" as const,
        mutationId:crypto.randomUUID(),expectedPreviousEventId:null};
      await expect(markExpectedOnsiteAttendance({data:observation})).rejects.toThrow("Future attendance dates cannot be marked");
      expect(await tx.select().from(s.attendanceEvents).where(eq(s.attendanceEvents.studentProfileId,learners[0]!.id))).toHaveLength(0);
      await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,grant!.id));
      await expect(getOnsiteSchoolDayPreparation({data:{date}})).rejects.toThrow("active site-bound onsite attendance assignment");
      await tx.update(s.accountPersonGrants).set({active:true}).where(eq(s.accountPersonGrants.id,grant!.id));
      vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(date+"T08:00:00Z"));
      try{
        const liveBefore=await listExpectedOnsiteRoster({data:{date}});
        expect(liveBefore.students).toContainEqual(expect.objectContaining({studentProfileId:learners[0]!.id,status:"unmarked"}));
        await markExpectedOnsiteAttendance({data:observation});
        const liveAfter=await listExpectedOnsiteRoster({data:{date}});
        expect(liveAfter.students).toContainEqual(expect.objectContaining({studentProfileId:learners[0]!.id,status:"present"}));
        expect(liveAfter.students.some(student=>student.studentProfileId===learners[1]!.id)).toBe(false);
      }finally{vi.useRealTimers();}
      checked=true;throw rollback;
    });}catch(error){if(error!==rollback)throw error;}finally{state.tx=undefined;state.actor=undefined;vi.useRealTimers();}
    expect(checked).toBe(true);
  },120_000);
});
