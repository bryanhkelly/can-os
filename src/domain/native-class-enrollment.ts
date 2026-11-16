import { AuthorizationError } from "./command-context";
import type { ClassDefinition, ClassOfferingTerms } from "./unified-class";

/** UTC calendar comparison, rejecting unknown and impossible birth dates. */
export function verifiedAdultOn(dateOfBirth: string | null | undefined, on: Date): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(on.getTime())) return false;
  const [year,month,day] = dateOfBirth.split("-").map(Number);
  const birth = new Date(Date.UTC(year!,month!-1,day!));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month!-1 || birth.getUTCDate() !== day) return false;
  const age = on.getUTCFullYear() - year! -
    (on.getUTCMonth()+1 < month! || (on.getUTCMonth()+1 === month! && on.getUTCDate() < day!) ? 1 : 0);
  return age >= 18 && age <= 125;
}

export type NativeSelfEnrollmentPolicy = {
  classState: "draft"|"approved"|"active"|"completed"|"cancelled";
  offeringState: "draft"|"published"|"closed";
  terms: Pick<ClassOfferingTerms, "visibility"|"enrollmentMethods"> & {
    opensAt: Date | null; closesAt: Date | null;
  };
  adultVerified: boolean;
  adultAttested: boolean;
  consentAccepted: boolean;
  consentVersion: string | null;
  consentText: string | null;
};
/** Self-enrollment never follows from visibility alone, and never grants
 * guardian, youth, staff-assignment or invitation authority. */
export function assertNativeSelfEnrollmentEligible(input:NativeSelfEnrollmentPolicy, now:Date):void {
  if (!Number.isFinite(now.getTime()) || input.classState !== "active" || input.offeringState !== "published") {
    throw new AuthorizationError("active Class and published Class Offering");
  }
  if (!["public","unlisted"].includes(input.terms.visibility) ||
      !input.terms.enrollmentMethods.includes("self")) {
    throw new AuthorizationError("authorized self-enrollment method and visibility");
  }
  if (input.terms.opensAt && now < input.terms.opensAt ||
      input.terms.closesAt && now >= input.terms.closesAt) {
    throw new AuthorizationError("open Class Offering enrollment window");
  }
  if (!input.adultVerified || !input.adultAttested) {
    throw new AuthorizationError("verified adult self-enrollment");
  }
  if (!input.consentAccepted || !input.consentVersion || !input.consentText) {
    throw new AuthorizationError("current published participation consent");
  }
}

export type NativeAttempt = {
  id:string;
  classEnrollmentId:string|null;
  enrollmentId:string|null;
  noncreditRegistrationId:string|null;
  deploymentId:string;
  adoptionId:string;
  offeringVersionId:string;
  courseVersionId:string;
  status:"planned"|"active"|"completed"|"withdrawn";
};
export type NativeEnrollment = {
  id:string;
  classId:string;
  learnerPersonId:string;
  courseAttemptId:string|null;
  status:"pending"|"active"|"completed"|"withdrawn"|"cancelled";
};
export type NativeClass = Pick<ClassDefinition,
  "deploymentId"|"adoptionId"|"offeringVersionId"|"courseVersionId"> & {
  id:string;
  state:"draft"|"approved"|"active"|"completed"|"cancelled";
};
export type NativeDeliveryAuthority = {
  deploymentState:"planning"|"review"|"authorized"|"active"|"suspended"|"closed";
  adoptionState:"proposed"|"approved"|"suspended"|"ended";
  adoptionValidFrom:Date;
  adoptionValidThrough:Date|null;
  coursePublished:boolean;
  offeringPublished:boolean;
};
/** Sole native participant resolution: there is no academic/noncredit source
 * dispatch, no Section shortcut and no credit-based permission grant. */
export function authorizeNativeClassAttempt(args:{
  actorPersonId:string|null;
  attempt:NativeAttempt|null;
  enrollment:NativeEnrollment|null;
  classInstance:NativeClass|null;
  authority:NativeDeliveryAuthority|null;
  now:Date;
  historicalRead?:boolean;
}):{classId:string;classEnrollmentId:string;courseAttemptId:string;courseVersionId:string}{
  const {actorPersonId,attempt,enrollment,classInstance,authority,now,historicalRead=false}=args;
  const deny=():never=>{throw new AuthorizationError("native Class learner participation");};
  if(!actorPersonId || !attempt || !enrollment || !classInstance || !authority ||
     !Number.isFinite(now.getTime())) return deny();
  if(attempt.classEnrollmentId!==enrollment.id ||
     attempt.enrollmentId!==null || attempt.noncreditRegistrationId!==null ||
     enrollment.courseAttemptId!==attempt.id ||
     enrollment.classId!==classInstance.id || enrollment.learnerPersonId!==actorPersonId ||
     attempt.deploymentId!==classInstance.deploymentId ||
     attempt.adoptionId!==classInstance.adoptionId ||
     attempt.offeringVersionId!==classInstance.offeringVersionId ||
     attempt.courseVersionId!==classInstance.courseVersionId) return deny();
  const active=attempt.status==="active" && enrollment.status==="active" && classInstance.state==="active";
  const historical=historicalRead && attempt.status==="completed" &&
    enrollment.status==="completed" && ["active","completed"].includes(classInstance.state);
  if(!active&&!historical)return deny();
  if(authority.deploymentState!=="active" || authority.adoptionState!=="approved" ||
     !authority.coursePublished || !authority.offeringPublished ||
     authority.adoptionValidFrom > now ||
     authority.adoptionValidThrough!==null && authority.adoptionValidThrough <= now)return deny();
  return {classId:classInstance.id,classEnrollmentId:enrollment.id,
    courseAttemptId:attempt.id,courseVersionId:attempt.courseVersionId};
}
