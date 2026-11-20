import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuardianEnrollmentNextSteps } from "./GuardianEnrollmentNextSteps";
import { GuardianGradeQuestions } from "./GuardianGradeQuestions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to, search: _search, children}: { to: string; search?: unknown; children: ReactNode }) =>
    <a href={to}>{children}</a>,
}));

describe("shared guardian home panels", () => {
  it("shows an unavailable enrollment read without inventing an application", () => {
    const html=renderToStaticMarkup(<GuardianEnrollmentNextSteps
      applications={[]} enrollmentWarning="Enrollment data unavailable." />);
    expect(html).toContain("Enrollment data unavailable.");
    expect(html).not.toContain("Prepare for school");
  });
  it("distinguishes a school response from a pending grade question", () => {
    type Question = Parameters<typeof GuardianGradeQuestions>[0]["questions"][number];
    const questions=[{
      id:"question-one",studentName:"Student One",assessmentTitle:"Math essay",status:"resolved",
      question:"Why was the score changed?",resolutionNote:"Teacher confirmed the review.",
      studentPersonId:"student-1",sectionId:"section-1",assessmentId:"assessment-1",submissionId:"submission-1",
    }] as unknown as Question[];
    const html=renderToStaticMarkup(<GuardianGradeQuestions questions={questions}
      selectedStudentId="student-1"/>);
    expect(html).toContain("School responded");
    expect(html).toContain("Teacher confirmed the review.");
    expect(html).toContain("View grade and school follow-up");
  });
});
