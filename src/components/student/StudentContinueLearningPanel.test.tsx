import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentContinueLearningPanel } from "./StudentContinueLearningPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search}: {to:string;children:ReactNode;search?:unknown})=>
    <a href={to}>{children}</a>,
}));
vi.mock("./StudentAssignmentLink", () => ({
  StudentAssignmentLink: ({children}: {children:ReactNode})=><div>{children}</div>,
}));
vi.mock("@/components/workspace/dashboard-widgets", () => ({
  DashboardProgress: ({label,value,max}: {label:string;value:number;max:number})=>
    <div>{label}: {value} of {max}</div>,
}));

describe("student learning resumption panel", () => {
  it("does not treat an unavailable lesson read as no enrollment", () => {
    const html=renderToStaticMarkup(<StudentContinueLearningPanel
      resume={null} unavailable={true} hasClasses={true}/>);
    expect(html).toContain("Your lesson progress could not be loaded");
    expect(html).not.toContain("No enrolled classes are available yet");
  });
  it("keeps self-reported completion distinct from mastery or earned credit", () => {
    const html=renderToStaticMarkup(<StudentContinueLearningPanel
      resume={{sectionId:"section-1",title:"Digital skills",
        lesson:{id:"lesson-1",title:"Using research tools",estimatedMinutes:15},
        completed:2,total:5}}
      unavailable={false} hasClasses={true}/>);
    expect(html).toContain("Self-reported lesson completion");
    expect(html).toContain("2 of 5");
    expect(html).toContain("not mastery or earned credit");
  });
  it("preserves a genuine no-enrollment state", () => {
    const html=renderToStaticMarkup(<StudentContinueLearningPanel
      resume={null} unavailable={false} hasClasses={false}/>);
    expect(html).toContain("No enrolled classes are available yet");
  });
});
