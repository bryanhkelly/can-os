import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassAssessmentEvidence } from "./ClassAssessmentEvidence";

const items = [
  { id: "a", title: "Unit quiz", score: "8", pointsPossible: "10", status: "graded" },
  { id: "b", title: "Written response", score: null, pointsPossible: "20", status: "submitted" },
];

describe("ClassAssessmentEvidence", () => {
  it("shows student reviewed scores and pending submissions without implying credit", () => {
    const html = renderToStaticMarkup(<ClassAssessmentEvidence items={items}
      summary={{graded:1,awaitingFeedback:1}} isTeacher={false} classwork={null}/>);
    expect(html).toContain("Reviewed: 8 / 10 points");
    expect(html).toContain("Submitted · awaiting teacher review");
    expect(html).toContain("not a mastery decision or course credit");
  });
  it("keeps individual student scores out of the teacher overview", () => {
    const html = renderToStaticMarkup(<ClassAssessmentEvidence items={items}
      summary={{graded:1,awaitingFeedback:1}} isTeacher classwork={null}/>);
    expect(html).not.toContain("Reviewed: 8 / 10 points");
    expect(html).toContain("2 published class assessments");
  });
});
