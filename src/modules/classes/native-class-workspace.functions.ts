import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassStaffAssignments, canonicalClassEnrollments,
  canonicalClassOfferings, canonicalClassOfferingVersions, canonicalPersons,
  canonicalAccountGrants, canonicalAccounts, courseLessons, courseUnits,
  canonicalClassSessions, canonicalDeliverySessions, facilitatedClassroomPlans,
  facilitatedLearningSessions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { classViews, classTabs, selectClassTab, selectClassView } from "@/domain/class-views";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { currentClassAuthority } from "./native-class-enrollment.functions";
import { validateClassAuthority } from "./unified-class.functions";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
import { assertCurrentNativeTeachingGrant } from "./native-class-room-boundary.server";

const uuid = z.string().uuid();
const scope = z.object({
  classId: uuid,
  view: z.enum(classViews).optional(),
  tab: z.string().trim().max(40).optional(),
  lesson: uuid.optional(),
  session: uuid.optional(),
}).strict();

/**
 * One Class ID and one role-aware workspace. The URL never supplies a role,
 * enrollment ID or staff permission. All permissible perspectives are rebuilt
 * from the current verified Person and current Class relationships.
 */
export const getNativeClassWorkspace = createServerFn({method:"GET"})
  .validator((raw:unknown)=>scope.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("verified Class member");
    return db.transaction(async tx=>{
      const [instance]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).limit(1);
      if(!instance)throw new AuthorizationError("available Class");
      const now=new Date();
      let canLearn=false;
      let canTeach=false;
      let canManage=false;
      let learner:{classEnrollmentId:string;courseAttemptId:string;creditMode:string;status:string}|null=null;
      let staffRole:"teacher"|"facilitator"|null=null;

      // A Person's individual learning record is not exposed merely because
      // they teach, operate or administer the same Class.
      if(actor.role==="learner"&&actor.capabilities.has("learning.participate")){
        const active=await tx.select({
          id:canonicalClassEnrollments.id,
          courseAttemptId:canonicalClassEnrollments.courseAttemptId,
          creditMode:canonicalClassEnrollments.creditMode,
          status:canonicalClassEnrollments.status,
        }).from(canonicalClassEnrollments).where(and(
          eq(canonicalClassEnrollments.classId,instance.id),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
          inArray(canonicalClassEnrollments.status,["active","completed"]),
        )).orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(2);
        if(active.length>1)throw new AuthorizationError("ambiguous current Class enrollment");
        const current=active[0];
        if(current?.courseAttemptId){
          const access=await authorizeCanonicalCourseAttempt(tx,actor,current.courseAttemptId,true);
          if(access.source!=="class" || access.courseVersionId!==instance.courseVersionId)
            throw new AuthorizationError("native Class Course attempt");
          canLearn=true;
          learner={classEnrollmentId:current.id,courseAttemptId:current.courseAttemptId,
            creditMode:current.creditMode,status:current.status};
        }
      }

      // A school/site/organization role ALONE never grants instructional
      // access. An explicit approved person-to-Class assignment is required.
      if(instance.siteId &&
          ["room_facilitator","site_admin","registrar"].includes(actor.role??"") &&
          actor.capabilities.has("learning.room.facilitate") &&
          actor.scope.siteIds?.includes(instance.siteId) &&
          actor.scope.organizationIds?.includes(instance.operatingOrganizationId)){
        const assignments=await tx.select({
          roleCode:canonicalClassStaffAssignments.roleCode,
        }).from(canonicalClassStaffAssignments).where(and(
          eq(canonicalClassStaffAssignments.classId,instance.id),
          eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
          eq(canonicalClassStaffAssignments.state,"approved"),
          lte(canonicalClassStaffAssignments.beginsAt,now),
          or(isNull(canonicalClassStaffAssignments.endsAt),
            gt(canonicalClassStaffAssignments.endsAt,now)),
        )).limit(2);
        if(assignments.length){
          await assertCurrentNativeTeachingGrant(tx,actor.actorPersonId,instance.operatingOrganizationId,instance.siteId);
          // Revoke or expire underlying publisher, deployment, adoption or Site
          // authority and teaching access disappears immediately.
          await currentClassAuthority(tx,instance.id,now);
          staffRole=assignments.some(x=>x.roleCode==="teacher")?"teacher":"facilitator";
          canTeach=true;
        }
      }

      if(["site_admin","registrar"].includes(actor.role??"") &&
         actor.capabilities.has("class.manage") &&
         actor.scope.organizationIds?.includes(instance.operatingOrganizationId) &&
         (instance.siteId
           ? actor.scope.siteIds?.includes(instance.siteId)
           : instance.createdByPersonId===actor.actorPersonId)){
        await validateClassAuthority(tx,{
          actor,organizationId:instance.operatingOrganizationId,
          siteIds:actor.scope.siteIds??[],
        },{
          deploymentId:instance.deploymentId,adoptionId:instance.adoptionId,
          offeringVersionId:instance.offeringVersionId,
          courseVersionId:instance.courseVersionId,
          operatingOrganizationId:instance.operatingOrganizationId,
          siteId:instance.siteId,title:instance.title,
          deliveryMode:instance.deliveryMode,
        });
        canManage=true;
      }

      const permitted={learn:canLearn,teach:canTeach,manage:canManage};
      const view=selectClassView(data.view,permitted);
      const tab=selectClassTab(view,data.tab);

      const permittedViews=classViews.filter(v=>permitted[v]);
      let lessons:Array<{
        id:string;title:string;unitTitle:string;lessonOrder:number;
      }>=[];
      if(view==="teach"){
        lessons=await tx.select({
          id:courseLessons.id,title:courseLessons.title,
          unitTitle:courseUnits.title,lessonOrder:courseLessons.lessonOrder,
        }).from(courseLessons).innerJoin(courseUnits,and(
          eq(courseUnits.id,courseLessons.courseUnitId),
          eq(courseUnits.courseVersionId,instance.courseVersionId),
        )).where(eq(courseLessons.courseVersionId,instance.courseVersionId))
          .orderBy(asc(courseUnits.sequenceNo),asc(courseLessons.lessonOrder)).limit(500);
      }

      // Only the Class operator or an explicitly assigned teacher receives
      // personally identifying roster information. A facilitator sees counts.
      // A teaching assignment is not, by itself, permission to read minor or adult learner identities.
      const rosterAllowed=canManage||(view==="teach"&&staffRole==="teacher"&&
        actor.capabilities.has("class.roster.view"));
      let roster:Array<{enrollmentId:string;personId:string;name:string;status:string;creditMode:string}>=[];
      let rosterCount=0;
      if((view==="teach"||view==="manage")){
        const [total]=await tx.select({value:count()}).from(canonicalClassEnrollments)
          .where(and(eq(canonicalClassEnrollments.classId,instance.id),
            inArray(canonicalClassEnrollments.status,["pending","active"])));
        rosterCount=total?.value??0;
        if(rosterAllowed && (tab==="roster"||tab==="overview")){
          const rows=await tx.select({
            enrollmentId:canonicalClassEnrollments.id,
            personId:canonicalPersons.id,
            preferredName:canonicalPersons.preferredName,
            firstName:canonicalPersons.legalFirstName,
            lastName:canonicalPersons.legalLastName,
            status:canonicalClassEnrollments.status,
            creditMode:canonicalClassEnrollments.creditMode,
          }).from(canonicalClassEnrollments)
            .innerJoin(canonicalPersons,
              eq(canonicalPersons.id,canonicalClassEnrollments.learnerPersonId))
            .where(and(eq(canonicalClassEnrollments.classId,instance.id),
              inArray(canonicalClassEnrollments.status,["pending","active"])))
            .orderBy(asc(canonicalPersons.legalLastName),asc(canonicalPersons.legalFirstName))
            .limit(100);
          roster=rows.map(row=>({
            enrollmentId:row.enrollmentId,personId:row.personId,
            name:row.preferredName??([row.firstName,row.lastName].filter(Boolean).join(" ")||"Learner"),
            status:row.status,creditMode:row.creditMode,
          }));
        }
      }

      let offering:null|{
        id:string;state:string;versionNo:number;visibility:string;
        enrollmentMethods:string[];allowedCreditModes:string[];capacity:number|null;
      }=null;
      if(view==="manage"){
        const [latest]=await tx.select({
          id:canonicalClassOfferingVersions.id,
          state:canonicalClassOfferingVersions.state,
          versionNo:canonicalClassOfferingVersions.versionNo,
          visibility:canonicalClassOfferingVersions.visibility,
          enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
          allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
          capacity:canonicalClassOfferingVersions.capacity,
        }).from(canonicalClassOfferingVersions)
          .innerJoin(canonicalClassOfferings,and(
            eq(canonicalClassOfferings.id,canonicalClassOfferingVersions.classOfferingId),
            eq(canonicalClassOfferings.classId,instance.id),
          ))
          .where(eq(canonicalClassOfferingVersions.classId,instance.id))
          .orderBy(desc(canonicalClassOfferingVersions.versionNo)).limit(1);
        offering=latest??null;
      }


      let staffCandidates:Array<{personId:string;name:string}>=[];
      let staffAssignments:Array<{id:string;personId:string;roleCode:string;name:string}>=[];
      if(view==="manage" && instance.siteId){
        const candidateRows=await tx.select({
          personId:canonicalPersons.id,
          firstName:canonicalPersons.legalFirstName,
          lastName:canonicalPersons.legalLastName,
          preferredName:canonicalPersons.preferredName,
        }).from(canonicalAccountGrants)
          .innerJoin(canonicalPersons,eq(canonicalPersons.id,canonicalAccountGrants.personId))
          .innerJoin(canonicalAccounts,eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
          .where(and(
            eq(canonicalAccountGrants.organizationId,instance.operatingOrganizationId),
            eq(canonicalAccountGrants.siteId,instance.siteId),
            eq(canonicalAccountGrants.roleCode,"room_facilitator"),
            eq(canonicalAccountGrants.active,true),
            isNull(canonicalAccountGrants.revokedAt),
            isNull(canonicalAccounts.disabledAt),
            isNotNull(canonicalAccounts.emailVerifiedAt),
          )).limit(100);
        staffCandidates=[...new Map<string,{personId:string;name:string}>(
          candidateRows.map(row=>[row.personId,{
            personId:row.personId,
            name:row.preferredName??([row.firstName,row.lastName].filter(Boolean).join(" ")||"Facilitator"),
          }] as const),
        ).values()];
        const assigned=await tx.select({
          id:canonicalClassStaffAssignments.id,
          personId:canonicalClassStaffAssignments.personId,
          roleCode:canonicalClassStaffAssignments.roleCode,
          firstName:canonicalPersons.legalFirstName,
          lastName:canonicalPersons.legalLastName,
          preferredName:canonicalPersons.preferredName,
        }).from(canonicalClassStaffAssignments)
          .innerJoin(canonicalPersons,eq(canonicalPersons.id,canonicalClassStaffAssignments.personId))
          .where(and(eq(canonicalClassStaffAssignments.classId,instance.id),
            eq(canonicalClassStaffAssignments.state,"approved"),
            lte(canonicalClassStaffAssignments.beginsAt,now),
            or(isNull(canonicalClassStaffAssignments.endsAt),
              gt(canonicalClassStaffAssignments.endsAt,now))))
          .limit(100);
        staffAssignments=assigned.map(row=>({
          id:row.id,personId:row.personId,roleCode:row.roleCode,
          name:row.preferredName??([row.firstName,row.lastName].filter(Boolean).join(" ")||"Staff"),
        }));
      }
      // Only managers can discover possible direct-assign participants.
      // Every target must already have a verified adult learner account
      // granted to this exact operating Organization and Site.
      let learnerCandidates:Array<{personId:string;name:string}>=[];
      if(view==="manage" && tab==="roster"){
        const rows=await tx.select({
          personId:canonicalPersons.id,
          birthDate:canonicalPersons.birthDate,
          preferredName:canonicalPersons.preferredName,
          firstName:canonicalPersons.legalFirstName,
          lastName:canonicalPersons.legalLastName,
        }).from(canonicalAccountGrants)
          .innerJoin(canonicalPersons,eq(canonicalPersons.id,canonicalAccountGrants.personId))
          .innerJoin(canonicalAccounts,eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
          .where(and(
            eq(canonicalAccountGrants.organizationId,instance.operatingOrganizationId),
            isNull(canonicalAccountGrants.siteId),
            eq(canonicalAccountGrants.roleCode,"learner"),
            eq(canonicalAccountGrants.active,true),
            isNull(canonicalAccountGrants.revokedAt),
            isNull(canonicalAccounts.disabledAt),
            isNotNull(canonicalAccounts.emailVerifiedAt),
            lte(canonicalAccountGrants.grantedAt,now),
          )).limit(101);
        const enrolled=new Set(roster.map(item=>item.personId));
        learnerCandidates=[...new Map<string,{personId:string;name:string}>(
          rows.filter(row=>verifiedAdultOn(row.birthDate,now)&&!enrolled.has(row.personId))
            .map(row=>[row.personId,{
              personId:row.personId,
              name:row.preferredName??([row.firstName,row.lastName].filter(Boolean).join(" ")||"Learner"),
            }] as const),
        ).values()];
      }
      const scheduleRows=await tx.select({
        id:canonicalClassSessions.id,
        planId:facilitatedClassroomPlans.id,
        state:facilitatedClassroomPlans.state,
        roomId:facilitatedClassroomPlans.facilitatedSessionId,
        roomState:facilitatedLearningSessions.state,
        startsAt:canonicalDeliverySessions.startsAt,
        endsAt:canonicalDeliverySessions.endsAt,
        facilitatorPersonId:canonicalClassSessions.facilitatorPersonId,
      }).from(canonicalClassSessions)
        .leftJoin(facilitatedLearningSessions,eq(
          facilitatedLearningSessions.id,facilitatedClassroomPlans.facilitatedSessionId,
        ))
        .innerJoin(facilitatedClassroomPlans,and(
          eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId),
          eq(facilitatedClassroomPlans.deliverySessionId,canonicalClassSessions.deliverySessionId),
          eq(facilitatedClassroomPlans.deploymentId,instance.deploymentId),
          eq(facilitatedClassroomPlans.courseVersionId,instance.courseVersionId),
          eq(facilitatedClassroomPlans.siteId,instance.siteId??"00000000-0000-0000-0000-000000000000"),
          eq(facilitatedClassroomPlans.hostOrganizationId,instance.operatingOrganizationId),
        ))
        .innerJoin(canonicalDeliverySessions,and(
          eq(canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId),
          eq(canonicalDeliverySessions.deploymentId,instance.deploymentId),
          eq(canonicalDeliverySessions.siteId,instance.siteId??"00000000-0000-0000-0000-000000000000"),
        ))
        .where(eq(canonicalClassSessions.classId,instance.id))
        .orderBy(asc(canonicalDeliverySessions.startsAt)).limit(101);
      const sessions=scheduleRows.slice(0,100).map(row=>({
        id:row.id,
        planId:view==="learn"?null:row.planId,
        roomId:view==="learn"?null:row.roomId,
        roomState:view==="learn"?null:row.roomState,
        state:row.state,
        startsAt:row.startsAt.toISOString(),
        endsAt:row.endsAt.toISOString(),
        isMySession:row.facilitatorPersonId===actor.actorPersonId,
      }));
      return {
        classId:instance.id,title:instance.title,
        courseVersionId:instance.courseVersionId,siteId:instance.siteId,
        deliveryMode:instance.deliveryMode,state:instance.state,
        view,tab,availableViews:permittedViews,
        availableTabs:classTabs[view],
        learner,staffRole,
        canViewRoster:rosterAllowed,
        rosterCount,roster,rosterTruncated:rosterAllowed&&rosterCount>roster.length,
        offering,lessons,staffCandidates,staffAssignments,learnerCandidates,
        sessions,sessionsTruncated:scheduleRows.length>100,
        selectedLessonId:data.lesson??null,
        selectedSessionId:data.session??null,
      };
    });
  });
