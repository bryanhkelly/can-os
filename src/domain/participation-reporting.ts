/**
 * WS6 evidence projection v0.1.0. Read-only and deliberately independent of
 * presentation or database access. Never infer attendance from device activity,
 * completion from a lesson click, or a credential from stated credit intent.
 */
export const CLASS_REPORT_CONTRACT_VERSION="0.1.0" as const;
export type EnrollmentStatus="pending"|"active"|"completed"|"withdrawn"|"cancelled";
export type EvidenceInput={
  classId:string;
  asOf:string;
  from:string;
  to:string; // exclusive UTC end
  offerings:ReadonlyArray<{id:string;offeringId:string;state:string;publishedAt:string|null}>;
  enrollments:ReadonlyArray<{
    id:string;personId:string;courseAttemptId:string|null;
    status:EnrollmentStatus;enrolledAt:string;
  }>;
  sessions:ReadonlyArray<{
    id:string;scheduledAt:string;planState:string;
    roomId:string|null;roomState:string|null;roomEndedAt:string|null;
  }>;
  attendance:ReadonlyArray<{
    id:string;roomId:string;courseAttemptId:string;
    status:"present"|"absent"|"unknown";assertedAt:string;
  }>;
  assessments:ReadonlyArray<{
    id:string;courseAttemptId:string;state:string;createdAt:string;
  }>;
  results:ReadonlyArray<{
    id:string;attemptId:string;revision:number;status:string;
  }>;
  outcomes:ReadonlyArray<{
    id:string;enrollmentId:string;kind:string;resultCode:string;recordedAt:string;
  }>;
  awards:ReadonlyArray<{
    id:string;outcomeId:string;issuedAt:string;revokedAt:string|null;
  }>;
};
export type ClassReportMetricKey=
  |"publishedOpportunities"|"registrations"|"uniquePeople"|"active"
  |"withdrawn"|"waitlisted"|"sessionsScheduled"|"sessionsDelivered"
  |"verifiedAttendance"|"verifiedAttendees"|"assessmentsSubmitted"
  |"assessmentsFinalized"|"formalCompletions"|"awardsIssued"|"awardsRevoked";
export type ClassReportMetrics=Record<ClassReportMetricKey,number|null>;
export type MetricDefinition={
  key:ClassReportMetricKey;label:string;source:string;
  denominator:string;rule:string;timeBasis:string;
};
export const CLASS_METRIC_DEFINITIONS:readonly MetricDefinition[]=[
  {key:"publishedOpportunities",label:"Published opportunities",source:"class_offering_versions",denominator:"distinct Class Offering",rule:"At least one version published during period, including versions subsequently closed",timeBasis:"published_at"},
  {key:"registrations",label:"Registrations",source:"class_enrollments",denominator:"Class Enrollment IDs",rule:"One record per enrollment, including later withdrawals",timeBasis:"enrolled_at"},
  {key:"uniquePeople",label:"Unique participants",source:"class_enrollments",denominator:"canonical Person IDs",rule:"Distinct Person IDs across registrations in period, not number of Course Attempts",timeBasis:"enrolled_at"},
  {key:"active",label:"Currently active",source:"class_enrollments",denominator:"in-period registrations",rule:"Current source status active; not a reconstructed past status",timeBasis:"enrolled_at + current status"},
  {key:"withdrawn",label:"Withdrawn",source:"class_enrollments",denominator:"in-period registrations",rule:"Current source status withdrawn; history preserved",timeBasis:"enrolled_at + current status"},
  {key:"waitlisted",label:"Waitlisted",source:"WS2 lifecycle contract",denominator:"distinct current pending waitlist positions",rule:"Unavailable until native Class waitlist authority is ratified; never display zero as inferred",timeBasis:"pending"},
  {key:"sessionsScheduled",label:"Sessions scheduled",source:"class_sessions + delivery_sessions + facilitated_classroom_plans",denominator:"delivery Session IDs",rule:"Distinct scheduled Session links; includes subsequently cancelled sessions",timeBasis:"delivery_sessions.starts_at"},
  {key:"sessionsDelivered",label:"Sessions delivered",source:"class_sessions + facilitated_learning_sessions",denominator:"delivery Session IDs",rule:"Linked live room must have ended; a scheduled or merely started plan is not delivered",timeBasis:"delivery_sessions.starts_at"},
  {key:"verifiedAttendance",label:"Verified attendance occurrences",source:"facilitated_room_attendance_assertions",denominator:"room ID and canonical Course Attempt ID pairs",rule:"Latest explicit host assertion is present; excludes device pairing and playback",timeBasis:"linked Session scheduled time, assertions as of query"},
  {key:"verifiedAttendees",label:"Verified attendees",source:"facilitated_room_attendance_assertions + class_enrollments",denominator:"canonical Person IDs",rule:"Unique Class-enrolled people with one or more latest present assertions in scoped rooms",timeBasis:"linked Session scheduled time, assertions as of query"},
  {key:"assessmentsSubmitted",label:"Assessment attempts submitted",source:"assessment_attempts + assessment_access_grants",denominator:"assessment attempt IDs",rule:"Submitted/scored/finalized assessment attempts for in-period Class registrations",timeBasis:"assessment_attempts.created_at"},
  {key:"assessmentsFinalized",label:"Finalized assessment attempts",source:"assessment_attempt_results",denominator:"assessment attempt IDs",rule:"Only latest result revision with status finalized; later void reverses count",timeBasis:"assessment_attempts.created_at, latest revision as of query"},
  {key:"formalCompletions",label:"Recorded completion outcomes",source:"class_outcomes",denominator:"Class Enrollment IDs",rule:"Unique enrolled records with completion result_code completed, never inferred from Course Attempt or playback. Pending WS3 mapping ratification",timeBasis:"class_outcomes.recorded_at"},
  {key:"awardsIssued",label:"Awards issued",source:"class_awards + class_outcomes",denominator:"award IDs",rule:"Issued in period, including later-revoked awards; distinct from valid awards",timeBasis:"class_awards.issued_at"},
  {key:"awardsRevoked",label:"Awards revoked",source:"class_awards",denominator:"award IDs",rule:"Revocations in period, independent of original issuance period",timeBasis:"class_awards.revoked_at"},
] as const;
function timestamp(value:string){
  const n=Date.parse(value);
  if(!Number.isFinite(n))throw new Error("Invalid reporting timestamp");
  return n;
}
function uniqueIds<T extends {id:string}>(rows:readonly T[],name:string){
  const ids=new Set<string>();
  for(const row of rows){
    if(!row.id||ids.has(row.id))throw new Error("Duplicate or absent "+name+" identity");
    ids.add(row.id);
  }
}
export function aggregateClassEvidence(input:EvidenceInput){
  const from=timestamp(input.from),to=timestamp(input.to),asOf=timestamp(input.asOf);
  if(!(from<to && from<=asOf))throw new Error("Invalid reporting interval or future period");
  const inPeriod=(value:string)=>{const t=timestamp(value);return t>=from&&t<to&&t<=asOf;};
  const throughAsOf=(value:string)=>timestamp(value)<=asOf;
  uniqueIds(input.enrollments,"Class Enrollment");
  uniqueIds(input.sessions,"Class Session");
  uniqueIds(input.attendance,"attendance assertion");
  uniqueIds(input.assessments,"assessment attempt");
  uniqueIds(input.results,"assessment result");
  uniqueIds(input.outcomes,"Class outcome");
  uniqueIds(input.awards,"Class award");
  const registered=input.enrollments.filter(r=>inPeriod(r.enrolledAt));
  const people=new Set(registered.map(r=>r.personId));
  const attemptToPerson=new Map<string,string>();
  for(const r of input.enrollments){
    if(!r.personId)throw new Error("Registration without canonical Person");
    if(!r.courseAttemptId)continue;
    const previous=attemptToPerson.get(r.courseAttemptId);
    if(previous && previous!==r.personId)throw new Error("Course Attempt belongs to multiple people");
    attemptToPerson.set(r.courseAttemptId,r.personId);
  }
  // In-period attendance and assessments may belong to participants who registered earlier.
  const eligibleAttempts=new Set(input.enrollments.filter(r=>throughAsOf(r.enrolledAt))
    .flatMap(r=>r.courseAttemptId?[r.courseAttemptId]:[]));
  const periodSessions=input.sessions.filter(s=>inPeriod(s.scheduledAt));
  const roomIds=new Set(periodSessions.filter(s=>s.roomId).map(s=>s.roomId!));
  const latestAttendance=new Map<string,EvidenceInput["attendance"][number]>();
  for(const assertion of input.attendance){
    if(!roomIds.has(assertion.roomId)||!eligibleAttempts.has(assertion.courseAttemptId)||
        !throughAsOf(assertion.assertedAt))continue;
    const key=assertion.roomId+":"+assertion.courseAttemptId;
    const previous=latestAttendance.get(key);
    if(!previous || timestamp(assertion.assertedAt)>timestamp(previous.assertedAt) ||
      (assertion.assertedAt===previous.assertedAt && assertion.id>previous.id))
      latestAttendance.set(key,assertion);
  }
  const present=[...latestAttendance.values()].filter(a=>a.status==="present");
  const periodAssessments=input.assessments.filter(a=>
    eligibleAttempts.has(a.courseAttemptId)&&inPeriod(a.createdAt));
  const lastResult=new Map<string,EvidenceInput["results"][number]>();
  const assessmentIds=new Set(periodAssessments.map(a=>a.id));
  for(const result of input.results){
    if(!assessmentIds.has(result.attemptId))continue;
    const prior=lastResult.get(result.attemptId);
    if(!prior || result.revision>prior.revision ||
       (result.revision===prior.revision && result.id>prior.id))
      lastResult.set(result.attemptId,result);
  }
  const enrollmentIds=new Set(input.enrollments.filter(r=>throughAsOf(r.enrolledAt)).map(r=>r.id));
  const completed=new Set(input.outcomes.filter(o=>
    enrollmentIds.has(o.enrollmentId)&&o.kind==="completion"&&
    o.resultCode==="completed"&&inPeriod(o.recordedAt)).map(o=>o.enrollmentId));
  const scopedOutcomes=new Set(input.outcomes.filter(o=>
    enrollmentIds.has(o.enrollmentId)).map(o=>o.id));
  const offerings=new Set(input.offerings.filter(o=>
    o.publishedAt&&inPeriod(o.publishedAt)&&["published","closed"].includes(o.state))
    .map(o=>o.offeringId));
  const metrics:ClassReportMetrics={
    publishedOpportunities:offerings.size,
    registrations:registered.length,
    uniquePeople:people.size,
    active:registered.filter(r=>r.status==="active").length,
    withdrawn:registered.filter(r=>r.status==="withdrawn").length,
    waitlisted:null,
    sessionsScheduled:new Set(periodSessions.map(s=>s.id)).size,
    sessionsDelivered:periodSessions.filter(s=>s.roomId&&s.roomState==="ended"&&
      !!s.roomEndedAt&&throughAsOf(s.roomEndedAt)).length,
    verifiedAttendance:present.length,
    verifiedAttendees:new Set(present.map(a=>attemptToPerson.get(a.courseAttemptId))).size,
    assessmentsSubmitted:periodAssessments.filter(a=>["submitted","scored","finalized"].includes(a.state)).length,
    assessmentsFinalized:periodAssessments.filter(a=>lastResult.get(a.id)?.status==="finalized").length,
    formalCompletions:completed.size,
    awardsIssued:input.awards.filter(a=>scopedOutcomes.has(a.outcomeId)&&inPeriod(a.issuedAt)).length,
    awardsRevoked:input.awards.filter(a=>scopedOutcomes.has(a.outcomeId)&&a.revokedAt&&
      inPeriod(a.revokedAt)).length,
  };
  if(metrics.uniquePeople! > metrics.registrations!)
    throw new Error("Unique people exceed registrations");
  if(metrics.sessionsDelivered! > metrics.sessionsScheduled!)
    throw new Error("Delivered sessions exceed scheduled sessions");
  return {contractVersion:CLASS_REPORT_CONTRACT_VERSION,asOf:input.asOf,
    classId:input.classId,period:{from:input.from,to:input.to},
    metrics,definitions:CLASS_METRIC_DEFINITIONS,
    limitations:[
      "Status reflects current source state; a historical as-of status cannot be reconstructed without lifecycle events.",
      "Formal Class completion outcome mapping awaits WS3 contract ratification.",
      "Waitlists are unavailable until WS2 confirms the native Class waitlist authority.",
      "Attendance counts explicit facilitator assertions, not school attendance or watch time.",
      "Provider-private figures require independently reviewed disclosure controls before external publication.",
    ]};
}
