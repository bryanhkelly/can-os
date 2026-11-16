import { AuthorizationError, type CommandContext } from "./command-context";
import type { z } from "zod";
import { classEnrollmentStatusSchema } from "./unified-class";
import { verifiedAdultOn } from "./native-class-enrollment";
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
  // A learner withdrawing a pending request produces "cancelled".
  // Its retry must remain idempotent even though the final status differs
  // from an active learner's "withdrawn" terminal state.
  const target = action === "withdraw"
    ? current === "pending" || current === "cancelled" ? "cancelled" : "withdrawn"
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

/** Published modes must map to working enrollment commands. Academic
 * credit eligibility is not established by adult consent, a Class title or a
 * publisher checkbox. Until the institutional credit placement command is
 * integrated, no native Class Offering may advertise for-credit registration.
 */
export function assertOperationalClassOfferingTerms(input:{
  enrollmentMethods: readonly string[];
  allowedCreditModes: readonly string[];
}):void{
  assertOperationalClassEnrollmentMethods(input.enrollmentMethods);
  if(input.allowedCreditModes.length===0 ||
     new Set(input.allowedCreditModes).size!==input.allowedCreditModes.length ||
     input.allowedCreditModes.some(mode=>
       mode!=="audit" && mode!=="not_applicable")){
    throw new AuthorizationError("operational noncredit Class participation modes");
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

/** A native Course Attempt may close only with its exact Class Enrollment and
 * published Course/Offering source. The selected attempt stays linked even
 * when previous completed or withdrawn retakes remain historical records.
 */
export function assertNativeClassAttemptForExit(input:{
  attempt:{
    id:string;classEnrollmentId:string|null;enrollmentId:string|null;
    noncreditRegistrationId:string|null;sectionId:string|null;
    deploymentId:string;adoptionId:string;offeringVersionId:string;
    courseVersionId:string;status:"planned"|"active"|"completed"|"withdrawn";
  };
  enrollment:{id:string;courseAttemptId:string|null};
  classInstance:{
    deploymentId:string;adoptionId:string;offeringVersionId:string;
    courseVersionId:string;
  };
  /** False only when closing additional active retakes from this enrollment. */
  requireSelectedPointer?:boolean;
}):void{
  const {attempt,enrollment,classInstance,requireSelectedPointer=true}=input;
  if(attempt.status!=="active" ||
     (requireSelectedPointer && attempt.id!==enrollment.courseAttemptId) ||
     attempt.classEnrollmentId!==enrollment.id ||
     attempt.enrollmentId!==null ||
     attempt.noncreditRegistrationId!==null ||
     attempt.sectionId!==null ||
     attempt.deploymentId!==classInstance.deploymentId ||
     attempt.adoptionId!==classInstance.adoptionId ||
     attempt.offeringVersionId!==classInstance.offeringVersionId ||
     attempt.courseVersionId!==classInstance.courseVersionId){
    throw new AuthorizationError("exact active native Class Course Attempt");
  }
}

/** Native Class self/assignment are verified-adult pathways. Do not infer
 * guardian authority from the learner login or an operator's Site grant. */
export function assertVerifiedAdultNativeClassExit(
  birthDate: string | null | undefined,
  now:Date,
):void{
  if(!verifiedAdultOn(birthDate,now))
    throw new AuthorizationError("verified adult Class lifecycle");
}


/** A Class has one authoritative pool of seats, regardless of enrollment
 * method. An optional public Offering cap is a *stricter* gate for that
 * Offering's self-enrollment, never additional seats for assignments.
 * Call under the Class's FOR UPDATE lock after the open-enrollment lookup.
 */
export function assertNativeClassSeatAvailable(args:{
  method:"self"|"assignment";
  activeOrPending:number;
  classCapacity:number|null;
  offeringCapacity?:number|null;
}):void{
  if(!Number.isSafeInteger(args.activeOrPending)||args.activeOrPending<0){
    throw new AuthorizationError("valid Class occupancy count");
  }
  const capacities=[args.classCapacity,
    ...(args.method==="self"?[args.offeringCapacity??null]:[])];
  for(const cap of capacities){
    if(cap!==null && (!Number.isSafeInteger(cap)||cap<=0)){
      throw new AuthorizationError("valid positive Class capacity");
    }
    if(cap!==null && args.activeOrPending>=cap){
      throw new AuthorizationError("Class is at capacity");
    }
  }
}

/** Stable reason semantics; a failed eligibility review is not an ordinary
 * cancellation of active learning. Retain policy-coded reasons in the outbox.
 */
export function assertNativeClassExitReason(
  status:ClassEnrollmentStatus,
  action:ClassClosureAction,
  reason:"requested"|"not_eligible"|"session_cancelled"|"operator_decision",
):void{
  if(action==="withdraw" && reason!=="requested" ||
     action==="cancel" && reason==="requested" ||
     reason==="not_eligible" && status!=="pending"){
    throw new AuthorizationError("consistent Class lifecycle reason");
  }
}
