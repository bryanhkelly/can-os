import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { roleCapabilities } from "@/domain/access-context";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Tx|undefined}));
vi.mock("@/db/client",()=>({get db(){if(!state.tx)throw new Error("Rollback transaction required");return state.tx;}}));
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
      await tx.insert(s.schoolConfigurationVersions).values({programId:program!.id,version:1,deploymentModel:"church_hosted",
        config:{grades:{min:"1",max:"12"},delivery:{onsite:true,asynchronous:false,liveOnline:false},services:["onsite_supervision"]}});
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
      const people=await tx.insert(s.people).values(["host","reviewer","primary","backup","replacement"].map(label=>({legalFirstName:"Synthetic",legalLastName:label}))).returning();
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
      checked=true;throw rollback;
    });}catch(error){if(error!==rollback)throw error;}finally{state.tx=undefined;}
    expect(checked).toBe(true);
  },120_000);
});
