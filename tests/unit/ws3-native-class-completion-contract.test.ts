import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const sql=read("database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql");
const bindingSql=read("database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql");
const command=read("src/modules/classes/native-class-completion.functions.ts");
const canonical=read("database/canonical/v3.0.1/patch-unified-class-course-attempts.sql");

describe("WS3 governed native Class completion contract",()=>{
  it("reuses original Class outcomes and complete Enrollment and Attempt, never issues awards",()=>{
    expect(sql).toContain("ALTER TABLE education_v30.class_outcomes");
    expect(sql).toContain("source_kind='ws3_governed'");
    expect(sql).toContain("class_enrollment_completion_pins");
    expect(sql).toContain("completion_policy_version_id");
    expect(sql).toContain("supersedes_outcome_id");
    expect(sql).toContain("ws3_class_completion_one_replacement");
    expect(command).toContain('outcomeKind:"completion"');
    expect(command).toContain('status:"completed",completedAt:new Date()');
    expect(command).toContain("tx.update(canonicalClassEnrollments)");
    expect(command).not.toContain("tx.insert(canonicalClassAwards)");
    expect(command).not.toContain("learningAwardIssuances");
  });
  it("allows an independently approved not-yet-completed learner to progress, not a terminal resurrection",()=>{
    expect(command).toContain('current.resultCode!=="not_yet_completed"');
    expect(sql).toContain("prior.result_code<>'not_yet_completed'");
    expect(sql).toContain("e.attempt_state<>'active'");
    expect(command).toContain("terminal Class history cannot be restarted");
  });
  it("respects canonical source trigger transition ordering",()=>{
    expect(canonical).toContain("class_row.enrollment_state<>'active'");
    const attemptMark=command.indexOf("tx.update(learnerCourseAttempts)");
    const classMark=command.indexOf("tx.update(canonicalClassEnrollments)");
    expect(attemptMark).toBeGreaterThan(-1);
    expect(classMark).toBeGreaterThan(attemptMark);
  });
  it("must lock a Class participant, current staff, exact Site and separate instructor",()=>{
    expect(command).toContain('.for("update").limit(1)');
    expect(command).toContain("validateClassAuthority");
    expect(command).toContain("canonicalClassStaffAssignments");
    expect(command).toContain("assertCurrentCanonicalStaffForMutation");
    expect(command).toContain("assertSourceBoundCompletionEvidence");
    expect(command).toContain("actor.scope.siteIds?.length!==1");
    expect(command).toContain("CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED");
    expect(command).toContain("CAN_UNIFIED_CLASS_COMMANDS_ENABLED");
  });
  it("requires approved evidence tied to specific Class and reviewer, not an arbitrary document",()=>{
    expect(bindingSql).toContain("class_completion_decision");
    expect(bindingSql).toContain("class_enrollment_id uuid REFERENCES");
    expect(bindingSql).toContain("expected_class_outcome_id uuid REFERENCES");
    expect(bindingSql).toContain("approved_class_outcome");
    expect(sql).toContain("binding.participant_person_id=e.learner_person_id");
    expect(sql).toContain("binding.expected_class_outcome_id");
    expect(sql).toContain("binding.delivery_site_id=attr.delivery_site_id");
    expect(sql).toContain("binding.approved_by_person_id<>NEW.completion_decided_by_person_id");
    expect(sql).toContain("class_completion_is_current");
  });
  it("resolves exactly one historical learner delivery Site for site-less Classes",()=>{
    expect(command).toContain("participationAttributions.deliverySiteId");
    expect(command).toContain("attribution.length!==1");
    expect(sql).toContain("attribution_count<>1");
    expect(sql).toContain("min(a.delivery_site_id)");
    expect(sql).toContain("attr.delivery_site_id=delivery_site");
    expect(sql).toContain("plan.site_id=delivery_site");
    expect(sql).toContain("room.site_id=delivery_site");
    expect(sql).toContain("cls.site_id IS NULL OR cls.site_id=attr.delivery_site_id");
    expect(sql).toContain("plan.site_id=attr.delivery_site_id");
    expect(sql).toContain("room.site_id=attr.delivery_site_id");
    expect(sql).not.toContain("plan.site_id=e.site_id");
    expect(sql).not.toContain("room.site_id=cls.site_id");
  });
  it("requires Class-linked ended room host assertions, never playback, pairing or agendas",()=>{
    expect(command).toContain("canonicalClassSessions.classroomPlanId");
    expect(command).toContain("facilitatedClassroomPlans.facilitatedSessionId");
    expect(command).toContain("facilitatedRoomAttendanceAssertions.courseAttemptId");
    expect(command).toContain('row.roomState!=="ended"');
    expect(command).toContain('row.status!=="present"');
    expect(command).toContain("canonicalAttendanceAssertionId:row.assertionId");
    expect(command).not.toContain("facilitatedRoomPresenceEvents");
    expect(command).not.toContain("facilitatedLearningPlayback");
  });
  it("requires finalized canonical assessments and ignores superseded revisions",()=>{
    expect(command).toContain("assessmentExecutionResults");
    expect(command).toContain("assessmentExecutionAttempts");
    expect(command).toContain("assessmentFormAdministrations");
    expect(command).toContain("versions.filter");
    expect(command).toContain("replaced.has(v.id)");
    expect(command).toContain('heads.length!==1');
  });
  it("does not claim release ready with the migrations disabled",()=>{
    expect(sql).toContain("DO NOT APPLY IN PRODUCTION");
    expect(bindingSql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
  });
});
