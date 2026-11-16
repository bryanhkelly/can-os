import { AuthorizationError } from "./command-context";
import type { z } from "zod";
import { classEnrollmentStatusSchema } from "./unified-class";
type ClassEnrollmentStatus = z.infer<typeof classEnrollmentStatusSchema>;

/**
 * WS2 native Class lifecycle v1. A terminal enrollment is historical evidence,
 * never a reusable identity or authority to restart the associated Course Attempt.
 */
export type ClassClosureAction = "withdraw" | "cancel";
export type ClassExitDecision = {
  enrollmentStatus: "withdrawn" | "cancelled";
  attemptStatus: "withdrawn" | null;
  releasedSeat: boolean;
  alreadyClosed: boolean;
};

/** Only the exact status requested is idempotent. Completing or resurrecting
 * a closed participation record belongs to its own authorized domain. */
export function planNativeClassExit(
  current: ClassEnrollmentStatus,
  action: ClassClosureAction,
): ClassExitDecision {
  const target = action === "withdraw"
    ? current === "pending" ? "cancelled" : "withdrawn"
    : "cancelled";
  if (current === target) return {
    enrollmentStatus: target, attemptStatus: null,
    releasedSeat: false, alreadyClosed: true,
  };
  if (current === "completed" || current === "withdrawn" || current === "cancelled") {
    throw new AuthorizationError("terminal Class participation history");
  }
  if (current !== "active" && current !== "pending") {
    throw new AuthorizationError("pending or active Class participation");
  }
  return {
    enrollmentStatus: target,
    attemptStatus: current === "active" ? "withdrawn" : null,
    releasedSeat: true,
    alreadyClosed: false,
  };
}

/** Publication v1 is deliberately narrower than the forward-compatible
 * database enum. Invitation and approval need audited offers, expiry and
 * guardian-aware decisions before they can be represented as available. */
export function assertOperationalClassEnrollmentMethods(
  methods: readonly string[],
): void {
  if (methods.length === 0 || new Set(methods).size !== methods.length ||
      methods.some(method => method !== "self" && method !== "assignment")) {
    throw new AuthorizationError("operational Class enrollment methods (self or verified adult assignment)");
  }
}

/** Repeat follows a fresh Class Enrollment, never a reopened historic one.
 * Finished participants require separately approved repeat eligibility.
 * Withdrawn/cancelled records may re-enter through normal current checks. */
export function assertNativeClassRepeatEligible(
  historical: readonly ClassEnrollmentStatus[],
): void {
  if (historical.includes("completed")) {
    throw new AuthorizationError("completed Class repeat requires approved policy");
  }
}
import type { CommandContext } from "./command-context";

export function assertNativeClassOperatorExitScope(
  actor: CommandContext,
  instance: {operatingOrganizationId:string;siteId:string|null},
):void{
  if(!actor.actorPersonId ||
     !["site_admin","registrar"].includes(actor.role??"") ||
     !actor.capabilities.has("class.manage") ||
     !instance.siteId ||
     actor.scope.organizationIds?.length!==1 ||
     actor.scope.siteIds?.length!==1 ||
     actor.scope.organizationIds[0]!==instance.operatingOrganizationId ||
     actor.scope.siteIds[0]!==instance.siteId){
    throw new AuthorizationError("exact active Class Site operator");
  }
}

/** Typed against the restricted canonical session-function result, not a
 * caller-supplied Person or a role picked in the browser. */
export function assertNativeClassLearnerSessionForExit(
  row:Record<string,unknown>,
  actorPersonId:string,
  operatingOrganizationId:string,
):void{
  if(row.person_id!==actorPersonId ||
     row.role_code!=="learner" ||
     row.organization_id!==operatingOrganizationId ||
     row.site_id!==null){
    throw new AuthorizationError("unchanged provider-scoped learner grant");
  }
}
