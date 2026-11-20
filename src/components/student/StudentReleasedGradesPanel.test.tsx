import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentReleasedGradesPanel } from "./StudentReleasedGradesPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
describe("released student grades", () => {
  it("never equates unavailable grades with an empty finalized record", () => {
    const error=renderToStaticMarkup(<StudentReleasedGradesPanel
      state={{ok:false,message:"Unavailable"} as never}/>);
    expect(error).toContain("Released grades could not be loaded");
    expect(error).not.toContain("No finalized grades yet");
  });
  it("renders a school-published grade without deriving additional scores", () => {
    const state={ok:true,data:[{
      sectionGradeId:"g-1",sectionTitle:"Literature",
      schoolYearName:"2026–27",gradingPeriodName:"Fall",letterGrade:"B",
      percentage:85,
    }]} as never;
    const html=renderToStaticMarkup(<StudentReleasedGradesPanel state={state}/>);
    expect(html).toContain("Literature");
    expect(html).toContain("B");
    expect(html).toContain("Released grade");
  });
});
