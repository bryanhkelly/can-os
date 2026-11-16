import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(path,"utf8");

describe("publisher Course Activities recover the original UX without a parallel engine",()=>{
  it("keeps Course publisher ownership distinct from local Class operator",()=>{
    const publisher=source("src/modules/classes/native-class-publisher.server.ts");
    const scope=source("src/modules/learning/native-class-assessment-scope.server.ts");
    const grant=source("src/modules/classes/native-class-assessment-provision.functions.ts");
    const final=source("src/modules/classes/native-class-assessment-finalize.functions.ts");
    expect(publisher).toContain("offerings.publisherOrganizationId");
    expect(publisher).toContain("canonicalOfferingCourses.courseVersionId");
    expect(scope).toContain("eq(assessmentDefinitions.ownerOrganizationId,publisherOrganizationId)");
    expect(scope).toContain('eq(assessmentFormAdministrations.administeringOrganizationId,cls.operatingOrganizationId)');
    expect(grant).toContain("c.ownerOrganizationId===publisherOrganizationId");
    expect(final).toContain("definition.ownerOrganizationId!==publisherOrganizationId");
    expect(grant).not.toContain("canonicalCourseActivitySets");
  });
  it("binds survey responses to exact Class campaigns, not just a Course or Deployment",()=>{
    const survey=source("src/modules/learning/course-surveys.functions.ts");
    const schema=source("src/db/canonical-v301/classes.ts");
    const ddl=source("database/canonical/v3.0.1/patch-unified-class-offerings.sql");
    expect(survey).toContain("classSurveyCampaignIds(tx,context,access)");
    expect(survey).toContain("allowedClassCampaigns.includes(data.campaignId)");
    expect(survey).toContain("eq(canonicalClassEnrollments.courseAttemptId,learnerCourseAttempts.id)");
    expect(survey).toContain("eq(canonicalClassEnrollments.learnerPersonId,context.actorPersonId)");
    expect(survey).toContain("noncreditIsolation");
    expect(schema).toContain('educationV30.table("class_survey_campaigns"');
    expect(ddl).toContain("campaign_id uuid PRIMARY KEY");
    expect(ddl).toContain("class_survey_campaign_class_idx");
    expect(ddl).toContain("canonical_class_survey_campaign_guard_trg");
    expect(ddl).toContain("canonical_linked_survey_scope_guard_trg");
    expect(ddl).toContain("Class attribution must precede survey invitations");
    expect(ddl).toContain("FORCE ROW LEVEL SECURITY");
  });
  it("requires an independently authorized local operator for campaign association",()=>{
    const link=source("src/modules/classes/native-class-survey-link.functions.ts");
    const manager=source("src/components/learning/NativeClassSurveyCampaignPanel.tsx");
    expect(link).toContain('assertCapability(actor,"class.manage")');
    expect(link).toContain("await validateClassAuthority(tx");
    expect(link).toContain("await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
    expect(link).toContain('eq(surveyCampaigns.deploymentId,deploymentId)');
    expect(link).toContain("current verified identified-survey permission");
    expect(link).toContain("link the Class before inviting survey participants");
    expect(manager).toContain("linkNativeClassSurveyCampaign");
    expect(manager).not.toContain("surveyAnswers");
  });
  it("uses the canonical draft writer but does not falsely publish a quiz or survey",()=>{
    const page=source("src/routes/canonical.course-activities.tsx");
    const options=source("src/modules/classes/publisher-course-activity-options.functions.ts");
    const packageJson=source("package.json");
    expect(page).toContain("createCanonicalSurveyDraft({data:value})");
    expect(page).toContain("getPublisherCourseActivityOptions()");
    expect(page).toContain("quizPackage");
    expect(page).toContain("unpublished-authoring-handoff");
    expect(page).toContain("independent approval");
    expect(page).not.toContain("publishNativeCourseActivitySet");
    expect(page).not.toContain("tx.insert(assessmentExecutionResults)");
    expect(options).toContain('assertCapability(actor,"curriculum.publish")');
    expect(options).toContain("eq(assessmentDefinitions.ownerOrganizationId,organizationId)");
    expect(packageJson).not.toContain("native-course-activities.test.ts");
  });
  it("offers a non-misleading completion checklist and contextual Class language",()=>{
    const view=source("src/components/learning/NativeClassCanonicalEvidencePanel.tsx");
    const assessment=source("src/components/learning/CourseAssessmentPanel.tsx");
    expect(view).toContain("Your learning checklist");
    expect(view).toContain("Participation and attendance");
    expect(view).toContain("Provider review");
    expect(view).toContain("Class completion outcome");
    expect(view).toContain('context="class"');
    expect(assessment).toContain('context?:"noncredit"|"class"');
    expect(assessment).toContain('context==="class"?"Class":"noncredit"');
    expect(view).not.toContain("recordNativeClassCompletionEvidence");
  });
});
