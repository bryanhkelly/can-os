import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canonical=readFileSync("database/canonical/v3.0.1/schema.sql","utf8");
const evidencePatch=readFileSync(
  "database/canonical/v3.0.1/patch-noncredit-evidence-and-result-authority.sql","utf8");
const autoPatch=readFileSync(
  "database/canonical/v3.0.1/patch-auto-noncredit-assessment-access.sql","utf8");
const feedbackPatch=readFileSync(
  "database/canonical/v3.0.1/patch-noncredit-feedback-invitations.sql","utf8");
const access=readFileSync("src/modules/learning/noncredit-assessment.server.ts","utf8");
const surveys=readFileSync("src/modules/learning/course-surveys.functions.ts","utf8");
const activities=readFileSync("src/components/learning/NoncreditCourseActivities.tsx","utf8");
const assessment=readFileSync("src/components/learning/CourseAssessmentPanel.tsx","utf8");
const pilotReport=readFileSync("src/modules/learning/noncredit-pilot-outcomes.functions.ts","utf8");
const surveyDisplay=readFileSync("src/components/learning/NoncreditCourseSurveys.tsx","utf8");
const providerEnrollment=readFileSync("src/routes/programs.noncredit.enrollment.tsx","utf8");
const publisher=readFileSync("src/modules/enrollment/noncredit-enrollment-publication.functions.ts","utf8");
const preflight=readFileSync("src/modules/enrollment/noncredit-training-readiness.server.ts","utf8");
const preflightView=readFileSync("src/components/enrollment/NoncreditTrainingReadiness.tsx","utf8");

describe("noncredit pilot correctness boundaries",()=>{
  it("enforces verified, current, unsuperseded attendance before completion",()=>{
    for(const sql of [canonical,evidencePatch]){
      expect(sql).toContain("JOIN evidence_document_versions v ON v.id=e.evidence_version_id");
      expect(sql).toContain("v.verified_by_person_id IS NOT NULL");
      expect(sql).toContain("v.verified_at<=NEW.decided_at");
      expect(sql).toContain("v.valid_through>=NEW.decided_at::date");
      expect(sql).toContain("e.occurred_at<=NEW.decided_at");
      expect(sql).toContain("newer.supersedes_id=e.id");
      expect(sql).toContain("ca.noncredit_registration_id=NEW.registration_id");
      expect(sql).toContain("grant_row.access_status='approved'");
    }
  });

  it("auto-provisions on approved course attempts and later-opened administrations",()=>{
    for(const sql of [canonical,autoPatch]){
      expect(sql).toContain("v301_noncredit_attempt_assessment_access");
      expect(sql).toContain("v301_noncredit_admin_assessment_access");
      expect(sql).toContain("t.state='published'");
      expect(sql).toContain("t.approved_by_person_id IS NOT NULL");
      expect(sql).toContain("ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING");
      expect(sql).toContain("ca.enrollment_id IS NULL AND ca.section_id IS NULL");
    }
  });

  it("invites feedback only through active, approved deployment campaigns",()=>{
    for(const sql of [canonical,feedbackPatch]){
      expect(sql).toContain("knowledge_check_submitted");
      expect(sql).toContain("v301_noncredit_knowledge_feedback");
      expect(sql).toContain("rule.enabled");
      expect(sql).toContain("permission.verified_by_person_id IS NOT NULL");
      expect(sql).toContain("c.deployment_id=participant.deployment_id");
      if(sql===feedbackPatch){
        expect(sql).toContain("c.offering_id=participant.offering_id");
        expect(sql).toContain("c.operating_organization_id=participant.registering_organization_id");
      }
      expect(sql).toContain("ON CONFLICT (campaign_id,invited_person_id) DO NOTHING");
    }
  });

  it("keeps current write windows distinct from historical read access",()=>{
    expect(access).toContain("readHistory=false");
    expect(access).toContain("loadNoncreditAssessment(tx,context,courseAttemptId,true)");
    expect(access).toContain('state:"closed" as const');
    expect(access).toContain("canStart=scope.canStart&&participantAttempt?.status");
    expect(assessment).toContain("check.canStart&&check.remainingAttempts>0");
  });

  it("only displays published and invited course surveys with permission evidence",()=>{
    expect(surveys).toContain("listNoncreditCourseSurveys");
    expect(surveys).toContain("surveyInvitations.invitedPersonId");
    expect(surveys).toContain("evidenceDocumentVersions.verifiedByPersonId");
    expect(surveys).toContain("current verified permission for identifiable feedback");
    expect(surveys).toContain("noncreditSurveyScope");
    expect(surveys).toContain("surveyCampaigns.offeringId,noncreditScope.offeringId");
    expect(surveys).toContain("surveyCampaigns.operatingOrganizationId,noncreditScope.operatingOrganizationId");
    expect(surveys).toContain("campaign.operatingOrganizationId!==noncreditScope.operatingOrganizationId");
    expect(activities).toContain("NoncreditCourseSurveys");
    expect(activities).toContain("CourseAssessmentPanel");
  });

  it("does not convert lesson ticks to attendance or school grades",()=>{
    const progress=readFileSync("src/modules/learning/student-instructional-tracks.server.ts","utf8");
    expect(progress).toContain('eventKind: "lesson_completed"');
    expect(progress).toContain("countedMinutes: 0");
    expect(activities).not.toContain("official_course_grades");
  });

  it("presents the complete noncredit learner sequence with recovery actions",()=>{
    expect(activities).toContain('id="course-knowledge-check"');
    expect(activities).toContain('id="course-feedback"');
    expect(activities).toContain('id="course-progress"');
    expect(activities).toContain("Retry learning activities");
    expect(activities).toContain("Retry completion status");
    expect(surveyDisplay).toContain("No feedback survey available");
    expect(surveyDisplay).toContain("Retry feedback");
  });

  it("retains historical assessment evidence when noncredit attempts close",()=>{
    expect(pilotReport).toContain('inArray(learnerCourseAttempts.status,["active","completed","withdrawn","cancelled"])');
    expect(pilotReport).not.toContain('eq(learnerCourseAttempts.status,"active")');
    expect(pilotReport).toContain('currentNoncreditCompletionStates(registrationIds,decisions)');
    expect(pilotReport).toContain('completion.states.get(reg.id)==="completed"');
    expect(pilotReport).toContain("completion.invalidRegistrations.length");
    expect(pilotReport).not.toContain("currentDecisions.find(");
  });

  it("does not report another Site's private noncredit training evidence",()=>{
    expect(pilotReport).toContain('requireCanonicalLabProvider("noncredit.enrollment.read")');
    expect(pilotReport).toContain("noncreditSelfEnrollmentClaims.registrationId");
    expect(pilotReport).toContain("noncreditSelfEnrollmentReleases.siteId,siteIds");
    expect(pilotReport).toContain("noncreditSelfEnrollmentReleases.registeringOrganizationId");
    expect(pilotReport).toContain("db.selectDistinct");
    expect(pilotReport).toContain("noncreditSelfEnrollmentReleases.trainingVersionId,noncreditTrainingVersions.id");
    expect(providerEnrollment).toContain("<NoncreditPilotOutcomesPanel/>");
  });

  it("credits feedback only to the matching Offering and operating Organization",()=>{
    expect(pilotReport).toContain("surveyCampaigns.offeringId,offeringIds");
    expect(pilotReport).toContain("surveyCampaigns.operatingOrganizationId");
    expect(pilotReport).toContain("registrationCounts.get(surveyKey)");
    expect(pilotReport).toContain("attributableNoncreditFeedback");
    expect(feedbackPatch).toContain("JOIN offering_versions ov ON ov.id=r.offering_version_id");
    expect(feedbackPatch).toContain("ALTER TABLE public.survey_trigger_rules");
    expect(feedbackPatch).toContain("JOIN public.survey_trigger_rules rule");
    expect(feedbackPatch).toContain("JOIN public.survey_definitions d");
    expect(feedbackPatch).not.toContain("education_v30.survey_trigger_rules");
  });

  it("checks one authorized training before release without bypassing publication",()=>{
    expect(publisher).toContain('getNoncreditTrainingReadiness=createServerFn({method:"GET"})');
    expect(publisher).toContain('requireCanonicalLabProvider("noncredit.enrollment.read")');
    expect(publisher).toContain('if(!selected)throw new AuthorizationError("authorized published training selection")');
    expect(publisher).toContain('readNoncreditTrainingReadiness(selected,provider.organizationId)');
    expect(preflight).toContain("courseLessons.courseVersionId");
    expect(preflight).toContain("assessmentFormItems.formVersionId");
    expect(preflight).toContain('row.status==="open"');
    expect(preflight).toContain("surveyCampaigns.operatingOrganizationId,operatingOrganizationId");
    expect(preflight).toContain("surveyCampaigns.offeringId,candidate.offeringId");
    expect(preflight).toContain("permissionSet.has(row.permissionId)");
    expect(preflightView).toContain("QueryState");
    expect(preflightView).toContain("counts must match".toLowerCase().slice(0,1).toUpperCase()+"ounts must match".slice(1));
    expect(providerEnrollment).toContain("<NoncreditTrainingReadiness");
    expect(preflight).not.toContain("tx.insert(");
    expect(preflight).not.toContain("tx.update(");
  });
});
