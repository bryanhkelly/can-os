import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";

const source = (path: string) => readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");

describe("continuous family enrollment handoff contracts", () => {
  it("offers academic-year and verified existing-student continuity without rekeying", () => {
    const html = renderToStaticMarkup(<GuardianApplicationForm
      programs={[{id:"program-1",name:"High School",schoolYears:[{id:"year-1",name:"2027–2028"}]}]}
      households={[{id:"household-1",name:"Family Household"},{id:"household-2",name:"Second Household"}]}
      students={[{studentProfileId:"profile-1",studentFirstName:"Existing",studentLastName:"Learner",
        gradeLevel:"10",householdId:"household-1"},{studentProfileId:"profile-1",
        studentFirstName:"Existing",studentLastName:"Learner",gradeLevel:"10",householdId:"household-2"}]}
      familyStartRequestId="start-1" requestedProgramId="program-1"
      onSubmit={async () => ({applicationId:"application-1"})}/>);
    expect(html).toContain("Application academic year");
    expect(html).toContain("2027–2028");
    expect(html).toContain("Existing Learner");
    expect(html).toContain('value="profile-1:household-2"');
    expect(html).toContain("verified managing relationship and shared household");
  });

  it("does not create another Person, profile or relationship on the reuse branch", () => {
    const service = source("src/modules/enrollment/enrollment-service.ts");
    const reuse = service.slice(service.indexOf("if (input.existingStudentProfileId) {",
      service.indexOf("let studentProfileId")),
      service.indexOf("} else {",service.indexOf("let studentProfileId")));
    expect(reuse).toContain("assertVerifiedFamilyStudentReuse");
    expect(reuse).not.toContain(".insert(people)");
    expect(reuse).not.toContain(".insert(studentProfiles)");
    expect(reuse).not.toContain(".insert(guardianRelationships)");
    expect(service).toContain("eq(applications.studentProfileId,input.existingStudentProfileId)");
  });

  it("links public provenance only after a consumed verified family start", () => {
    const service = source("src/modules/enrollment/enrollment-service.ts");
    expect(service).toContain("isNotNull(publicFamilyStartRequests.consumedAt)");
    expect(service).toContain("isNotNull(accessAccounts.emailVerifiedAt)");
    expect(service).toContain("publicFamilyStartRequestId:familyStart.id,publicInterestId:interest.id");
    const join = source("src/routes/family.join.tsx");
    expect(join).toContain('dest.searchParams.set("familyStart",result.requestId)');
  });

  it("shows real family application, document, consent and offer state", () => {
    const applications = source("src/routes/guardian.apply.tsx");
    expect(applications).toContain("app.schoolYearName");
    expect(applications).toContain("app.source");
    expect(applications).toContain("app.stage.replaceAll");
    const offers = source("src/routes/guardian.admission-offers.tsx");
    expect(offers).toContain("Offer status:");
    expect(offers).toContain("o.progress.message");
    expect(offers).toContain("GuardianEnrollmentChecklist");
    expect(offers).toContain("o.enrollmentActive");
    const checklist = source("src/components/enrollment/GuardianEnrollmentChecklist.tsx");
    expect(checklist).toContain("requirement.reviewStatus");
    expect(checklist).toContain("GuardianEnrollmentForm");
  });

  it("keeps accepted-offer activation on the canonical same-year placement command", () => {
    const service = source("src/modules/enrollment/admissions-offer-service.ts");
    expect(service).toContain('if(offer!.status!=="accepted")throw new Error("Guardian must accept offer first")');
    expect(service).toContain("schoolYearId:offer!.schoolYearId");
    expect(service).toContain('source:"accepted_offer_activation",applicationId:app.id');
    expect(service).toContain("await activateSectionEnrollment(tx");
  });
});
