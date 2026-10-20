export function admissionOfferProgress(input: {
  status:string; expiresAt:string|null; journeyStatus:string|null;
  blockers:number; enrollmentActive:boolean; sectionCount:number;
  applicationStage?:string; waitlisted?:boolean;
}, now=new Date()) {
  if(input.status==="declined"||input.status==="revoked"||input.status==="expired")return {
    state:input.status,message:input.status==="revoked"?"This offer was withdrawn. Contact admissions for next steps.":
      input.status==="declined"?"This offer was declined. Contact admissions if your plans change.":
      "This offer has expired. Contact admissions for next steps.",canAccept:false,
  };
  if(input.status==="issued"&&input.expiresAt&&new Date(input.expiresAt)<=now)
    return {state:"expired",message:"This offer has expired. Contact admissions for next steps.",canAccept:false};
  if(input.status!=="issued"&&input.status!=="accepted")
    return {state:"not_available",message:"This offer is not available for a response. Contact admissions.",canAccept:false};
  if(input.waitlisted||(input.applicationStage!==undefined&&!["application","eligibility","accepted"].includes(input.applicationStage)))
    return {state:"application_unavailable",message:input.waitlisted?
      "This application is waitlisted. Admissions must restore it to review before an offer can be accepted.":
      "This application is not open for offers. Contact admissions before responding to an offer.",canAccept:false};
  if(input.enrollmentActive)return {
    state:input.sectionCount?"enrolled":"awaiting_classes",
    message:input.sectionCount?"Enrollment is active and classes are assigned.":"Enrollment is active. Admissions will arrange your classes next.",
    canAccept:false,
  };
  if(input.blockers||input.journeyStatus!=="ready")return {
    state:"requirements_pending",
    message:input.status==="accepted"?"Your acceptance is recorded. Enrollment requirements still need review before activation.":
      "Enrollment requirements need review before you can accept. Contact admissions about the items below.",
    canAccept:false,
  };
  return input.status==="accepted"
    ?{state:"awaiting_activation",message:"Your acceptance is recorded. Admissions must activate enrollment before classes become available.",canAccept:false}
    :{state:"awaiting_response",message:"Review this offer and accept or decline. Acceptance does not activate enrollment.",canAccept:true};
}
