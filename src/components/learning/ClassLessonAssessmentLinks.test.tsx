import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassLessonAssessmentLinks } from "./ClassLessonAssessmentLinks";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
type Item=Parameters<typeof ClassLessonAssessmentLinks>[0]["items"][number];

describe("class lesson assessment links", () => {
  it("renders no section without authorized assessment items", () => {
    const html=renderToStaticMarkup(<ClassLessonAssessmentLinks
      items={[]} role="student" sectionId="section-1"/>);
    expect(html).toBe("");
  });
  it("sends teacher review to gradebook without disclosing a student score", () => {
    const items=[{id:"assessment-1",title:"Reflection",status:"graded",score:8,pointsPossible:10}] as unknown as Item[];
    const html=renderToStaticMarkup(<ClassLessonAssessmentLinks
      items={items} role="teacher" sectionId="section-1"/>);
    expect(html).toContain("Review in gradebook");
    expect(html).not.toContain("Graded: 8");
  });
  it("shows student feedback and routes to the assignment workspace", () => {
    const items=[{id:"assessment-1",title:"Reflection",status:"graded",score:8,pointsPossible:10}] as unknown as Item[];
    const html=renderToStaticMarkup(<ClassLessonAssessmentLinks
      items={items} role="student" sectionId="section-1"/>);
    expect(html).toContain("Graded: 8 / 10");
    expect(html).toContain("Open assignment");
  });
});
