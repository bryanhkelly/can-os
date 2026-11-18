/**
 * Platform operations diagnostics over real publisher records. These are
 * observations, NEVER a role grant, approval or current publishing authority.
 * Every mutation still requires its own verified current CAN session and
 * independent evidence-backed person appointment.
 */
export interface NativePublisherReleaseRecord {
  offeringVersionId:string;
  offeringTitle:string;
  versionNo:number;
  lifecycle:string;
  courseCount:number;
  publishedCourses:number;
  creatorMemberships:number;
  reviewerMemberships:number;
  creatorAppointedCourses:number;
  reviewerAppointedCourses:number;
  currentEvidenceRecords:number;
  releasePolicies:number;
  manifestStatus:string|null;
  releaseAssets:number;
  approvedAdoptions:number;
}

export type PublisherReleaseNextStep = {
  key:"composition"|"creator-membership"|"reviewer-membership"|"evidence"|
      "creator-appointment"|"reviewer-appointment"|"course-publication"|
      "policy"|"assets"|"asset-approval"|"offering-publication"|
      "adoption"|"class-verification";
  label:string;
  detail:string;
};

export function projectPublisherReleaseNextStep(
  record:Readonly<NativePublisherReleaseRecord>,
):PublisherReleaseNextStep{
  if(!record.courseCount)return {
    key:"composition",label:"Add native Courses",
    detail:"No Course versions are linked to this Offering version.",
  };
  if(!record.creatorMemberships)return {
    key:"creator-membership",label:"Verify Course creator membership",
    detail:"A real CAN Person needs a verified organization-wide creator grant, not a second login.",
  };
  if(!record.reviewerMemberships)return {
    key:"reviewer-membership",label:"Verify independent reviewer membership",
    detail:"Independently grant an eligible different Person reviewer membership. Organization access alone is not Course approval.",
  };
  if(!record.currentEvidenceRecords)return {
    key:"evidence",label:"Verify current publisher evidence",
    detail:"No currently verified evidence documents are recorded for the publisher Organization.",
  };
  if(record.creatorAppointedCourses<record.courseCount)return {
    key:"creator-appointment",label:"Appoint Course creators",
    detail:"Each native Course needs a current, evidence-backed creator appointment and approved capability authorization.",
  };
  if(record.reviewerAppointedCourses<record.courseCount)return {
    key:"reviewer-appointment",label:"Appoint independent Course reviewers",
    detail:"Each native Course requires an independently verified reviewer appointment and capability authorization.",
  };
  if(record.publishedCourses<record.courseCount)return {
    key:"course-publication",label:"Complete Course review and publication",
    detail:"Review the submitted manuscript independently; draft Courses are not publishable Offerings.",
  };
  if(record.releasePolicies<record.courseCount)return {
    key:"policy",label:"Review Offering release policies",
    detail:"Declare independently reviewed, evidence-backed release requirements for every Course.",
  };
  if(record.releaseAssets<1)return {
    key:"assets",label:"Attach reviewed instructional assets",
    detail:"Final Offering release requires real immutable publisher-owned assets with current rights and review evidence.",
  };
  if(record.manifestStatus!=="approved")return {
    key:"asset-approval",label:"Approve exact asset manifest",
    detail:"Independent publisher approval must cover the exact current snapshot; manifest status alone is not proof of current rights.",
  };
  if(record.lifecycle!=="published")return {
    key:"offering-publication",label:"Publish Offering version",
    detail:"Publishing requires current evidence, applicable recorded-teacher coverage and independent publication authorization.",
  };
  if(record.approvedAdoptions<1)return {
    key:"adoption",label:"Verify local adoption",
    detail:"A local operator must independently approve adoption of the exact published Offering version.",
  };
  return {
    key:"class-verification",label:"Verify Class launch prerequisites",
    detail:"A recorded adoption exists. Class authorization, Site placement, cohort sessions and enrollment still require separate live checks.",
  };
}
