import { rolesAllow, hasRegistrarAuthority } from "@/domain/school-roles";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {parseCommandInput} from "@/domain/command-input";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertAcademicActionAuthority } from "./academic-action-policy.server";
import { authorizeClass } from "@/modules/learning/class-access-core.server";
import type { Actor } from "@/modules/identity/actors.server";

export async function getActionDetailService(request:Request,raw:unknown){
 const data=parseCommandInput(z.object({actionId:z.string().uuid()}).strict(),raw);
    const actor = await getCommandContext(request);
    if (!actor.actorPersonId || !rolesAllow(["registrar", "teacher", "specialist", "counselor"], actor.role)) {
      throw new AuthorizationError("staff Action detail");
    }
    assertCapability(actor, "action.resolve");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [action] = await tx.select().from(s.actions).where(eq(s.actions.id, data.actionId)).limit(1);
      if (!action) throw new AuthorizationError("Action detail scope");
      if(action.subjectType==="class_enrollment"){
        const {getCanonicalCommandContext}=await import("@/modules/identity/canonical-command-context.server");
        const nativeActor=await getCanonicalCommandContext(request);
        const {assertNativeAcademicActionAuthority}=await import("./academic-action-policy.server");
        const target=await assertNativeAcademicActionAuthority(tx,nativeActor,action);
        return {
          id:action.id,title:action.title,description:action.description,type:action.type,status:action.status,priority:action.priority,
          dueAt:action.dueAt?.toISOString()??null,resolvedAt:action.resolvedAt?.toISOString()??null,
          resolutionNote:action.resolutionNote,siteId:action.siteId,programId:action.programId,sectionId:null,
          classId:target.classId,canReviewClass:true,canResolveMissingWork:true,canManageOperations:false,workspaceHome:"/class" as const,
        };
      }
      const delegatedAcademic = actor.role === "teacher" && action.type === "academic_intervention" &&
        action.subjectType === "student_profile" && action.sectionId !== null;
      // Earlier follow-up Actions may not have a Section ID. Use the original
      // assessment to verify the exact live teaching authorization.
      const originalAssessmentId=action.metadata?.assessmentId;
      const teacherMissing = actor.role === "teacher" &&
        action.type === "missing_work_follow_up" &&
        action.ownerPersonId === actor.actorPersonId &&
        action.subjectType === "student_profile" &&
        typeof originalAssessmentId === "string";
      let missingSectionId: string | null = null;
      if (teacherMissing && typeof originalAssessmentId==="string") {
        const [assessment] = await tx.select({
          sectionId:s.assessments.sectionId,
          siteId:s.sections.siteId,programId:s.sections.programId,
        }).from(s.assessments)
          .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
          .where(eq(s.assessments.id,originalAssessmentId)).limit(1);
        if(!assessment||assessment.siteId!==action.siteId||
          assessment.programId!==action.programId||
          (action.sectionId && action.sectionId !== assessment.sectionId))
          throw new AuthorizationError("original missing-work Action scope");
        await authorizeClass(actor as Actor,assessment.sectionId,undefined,tx);
        missingSectionId=assessment.sectionId;
      }
      if (!delegatedAcademic && !teacherMissing && (!action.organizationId || !actor.scope.organizationIds?.includes(action.organizationId) ||
          (action.siteId !== null && !actor.scope.siteIds?.includes(action.siteId)) ||
          (action.programId && !actor.scope.programIds?.includes(action.programId)) ||
          (action.sectionId && actor.scope.sectionIds !== undefined && !actor.scope.sectionIds.includes(action.sectionId)))) {
        throw new AuthorizationError("Action detail scope");
      }
      if (action.type === "support_referral") {
        throw new AuthorizationError("Use the support referral workspace");
      }
      if (action.type === "academic_intervention" && action.subjectType === "student_profile" && action.sectionId) {
        await assertAcademicActionAuthority(tx, actor, action);
      } else if (teacherMissing) {
        // The Action owner and class authorization were checked above.
      } else if (!hasRegistrarAuthority(actor.role) || !action.siteId) {
        throw new AuthorizationError("Action requires its owning workspace");
      }
      return {
        id: action.id, title: action.title, description: action.description,
        type: action.type, status: action.status, priority: action.priority,
        dueAt: action.dueAt?.toISOString() ?? null,
        resolvedAt: action.resolvedAt?.toISOString() ?? null,
        resolutionNote: action.resolutionNote,
        siteId: action.siteId, programId: action.programId,
        sectionId: missingSectionId ?? action.sectionId,classId:null,
        canReviewClass: (actor.role === "teacher" && action.type === "academic_intervention" && action.sectionId !== null) || teacherMissing,
        canResolveMissingWork: teacherMissing,
        canManageOperations: hasRegistrarAuthority(actor.role) && action.siteId !== null,
        workspaceHome: teacherMissing ? "/teacher/missing-work" as const : "/home" as const,
      };
    });
}
