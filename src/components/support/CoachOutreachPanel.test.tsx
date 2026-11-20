import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoachOutreachPanel } from "./CoachOutreachPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,params:_params,search:_search}:{
    to:string;children:ReactNode;params?:unknown;search?:unknown;
  })=><a href={to}>{children}</a>,
}));
type Student = NonNullable<Parameters<typeof CoachOutreachPanel>[0]["chosen"]>;
const base = {
  chosen:null, timeline:[], timelineLoading:false, historyError:"",
  note:"", outcome:"contacted" as const, busy:false, formError:"", message:"",
  onNoteChange:()=>{}, onOutcomeChange:()=>{}, onSubmit:()=>{},
};

describe("specialist outreach presentation", () => {
  it("does not expose a student's history before caseload selection", () => {
    const html=renderToStaticMarkup(<CoachOutreachPanel {...base}/>);
    expect(html).toContain("Select a student");
    expect(html).not.toContain("Log outreach");
  });
  it("keeps outreach disabled for incomplete notes and warns against clinical records", () => {
    const chosen={studentProfileId:"student-1",personId:"person-1",name:"Alex Learner"} as Student;
    const html=renderToStaticMarkup(<CoachOutreachPanel {...base} chosen={chosen}/>);
    expect(html).toContain("Alex Learner");
    expect(html).toContain("Do not enter clinical or private counseling notes");
    expect(html).toContain("disabled");
    expect(html).toContain("Log outreach");
  });
  it("shows a separately verified timeline error instead of fabricated history", () => {
    const chosen={studentProfileId:"student-1",personId:"person-1",name:"Alex Learner"} as Student;
    const html=renderToStaticMarkup(<CoachOutreachPanel {...base} chosen={chosen}
      historyError="Unable to read authorized history."/>);
    expect(html).toContain("Unable to read authorized history.");
  });
});
