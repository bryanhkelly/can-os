import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherLearningParticipationPanel } from "./TeacherLearningParticipationPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,params:_params,search:_search}:{
    to:string;children:ReactNode;params?:unknown;search?:unknown;
  })=><a href={to}>{children}</a>,
}));

describe("teacher learning participation", () => {
  it("does not equate missing instrumentation with absence of learning", () => {
    const html=renderToStaticMarkup(<TeacherLearningParticipationPanel
      activity={{students:[],note:"No recorded observations",truncated:false} as never}
      error="" onCreated={() => {}}/>);
    expect(html).toContain("No interaction evidence has been collected");
    expect(html).toContain("This does not mean students have not been learning");
    expect(html).toContain("not attendance, grades or a diagnosis");
  });
  it("displays authorized evidence read failures without manufacturing counts", () => {
    const html=renderToStaticMarkup(<TeacherLearningParticipationPanel
      activity={null} error="Learning evidence is unavailable." onCreated={() => {}}/>);
    expect(html).toContain("Learning evidence is unavailable");
    expect(html).not.toContain("recorded interactions in 7 days");
  });
});
