import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("database/canonical/v3.0.1/patch-noncredit-auto-finalization.sql","utf8");
const fresh=readFileSync("database/canonical/v3.0.1/schema.sql","utf8");
const learner=readFileSync("src/modules/learning/noncredit-assessment.server.ts","utf8");
const review=readFileSync("src/modules/learning/noncredit-assessment-review.server.ts","utf8");

describe("noncredit assessment isolation",()=>{
  it("retains independent review requirements for academic and other assessments",()=>{
    expect(sql).toContain("NEW.reviewed_by_person_id IS NULL");
    expect(sql).toContain("NEW.result_status='finalized'");
    expect(sql).toContain("definition.purpose IN ('formative','practice','readiness','mastery')");
    expect(sql).toContain("course.enrollment_id IS NULL");
    expect(sql).toContain("course.section_id IS NULL");
    expect(sql).toContain("assessment_item_scoring_decisions");
    expect(sql).toContain("scoring.scoring_kind='automated'");
    expect(sql).toContain("noncreditAutoFinalized");
    expect(sql).not.toContain("official_course_grades");
    expect(fresh).toContain("Re-apply the assessment result gate now that noncredit tables exist.");
  });

  it("never receives correct options from a client or returns them as a question payload",()=>{
    expect(learner).toContain("assessmentItemSecureKeys");
    expect(learner).toContain("openNoncreditAnswerKey");
    expect(learner).toContain("scoreNoncreditChoices");
    expect(learner).toContain("resultStatus:autoFinalize?");
    expect(learner).toContain("CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED");
    expect(learner).toContain('const secret=process.env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX');
    expect(learner).not.toContain("graded_submissions");
    expect(learner).not.toContain("official_course_grades");
  });

  it("preserves separate reviewer authorization as a fallback",()=>{
    expect(review).toContain("noncredit.assessment.finalize");
    expect(review).toContain('registration.participantPersonId===context.actorPersonId');
    expect(review).not.toContain("graded_submissions");
  });
});
