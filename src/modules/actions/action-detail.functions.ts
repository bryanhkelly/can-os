import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertAcademicActionAuthority } from "./academic-action-policy.server";

export const getActionDetail = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ actionId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    if (!actor.actorPersonId || !["registrar", "teacher", "specialist", "counselor"].includes(actor.role)) {
      throw new AuthorizationError("staff Action detail");
    }
    assertCapability(actor, "action.resolve");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [action] = await tx.select().from(s.actions).where(eq(s.actions.id, data.actionId)).limit(1);
      if (!action || !action.organizationId || !actor.scope.organizationIds?.includes(action.organizationId) ||
          (action.siteId !== null && !actor.scope.siteIds?.includes(action.siteId)) ||
          (action.programId && !actor.scope.programIds?.includes(action.programId)) ||
          (action.sectionId && actor.scope.sectionIds !== undefined && !actor.scope.sectionIds.includes(action.sectionId))) {
        throw new AuthorizationError("Action detail scope");
      }
      if (action.type === "support_referral") {
        throw new AuthorizationError("Use the support referral workspace");
      }
      if (action.type === "academic_intervention" && action.subjectType === "student_profile" && action.sectionId) {
        await assertAcademicActionAuthority(tx, actor, action);
      } else if (actor.role !== "registrar" || !action.siteId) {
        throw new AuthorizationError("Action requires its owning workspace");
      }
      return {
        id: action.id, title: action.title, description: action.description,
        type: action.type, status: action.status, priority: action.priority,
        dueAt: action.dueAt?.toISOString() ?? null,
        resolvedAt: action.resolvedAt?.toISOString() ?? null,
        resolutionNote: action.resolutionNote,
        siteId: action.siteId, programId: action.programId,
        canManageOperations: actor.role === "registrar" && action.siteId !== null && action.type !== "public_interest_follow_up",
        workspaceHome: action.type === "public_interest_follow_up" ? "/admissions/intake" as const
          : actor.role === "registrar" ? "/operations" as const
          : actor.role === "teacher" ? "/teacher" as const
          : actor.role === "counselor" ? "/counselor" as const : "/coach" as const,
      };
    });
  });
