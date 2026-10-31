import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GradebookOverview } from "./GradebookOverview";

describe("GradebookOverview", () => {
  it("shows authorized section counts and an empty review state", () => {
    const html = renderToStaticMarkup(
      <GradebookOverview studentCount={4} assessmentCount={3} submittedCount={0} showQueueEmpty />,
    );
    expect(html).toContain("Students");
    expect(html).toContain("Assessments");
    expect(html).toContain("Needs grading");
    expect(html).toContain("All caught up");
  });

  it("does not show an empty review state when a queue is available", () => {
    const html = renderToStaticMarkup(
      <GradebookOverview studentCount={4} assessmentCount={3} submittedCount={2} showQueueEmpty={false} />,
    );
    expect(html).not.toContain("All caught up");
  });
});
