import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowPrerequisites } from "./WorkflowPrerequisites";
import { WorkflowHandoff } from "./WorkflowHandoff";

describe("shared workflow presentation", () => {
  it("shows unmet prerequisites without inventing authorization", () => {
    const html = renderToStaticMarkup(<WorkflowPrerequisites items={[
      { id: "site", label: "Site authorization", satisfied: false,
        explanation: "Awaiting CAN authorization" },
      { id: "staff", label: "Onsite staffing", satisfied: true },
    ]}/>);
    expect(html).toContain("Site authorization");
    expect(html).toContain("Awaiting CAN authorization");
    expect(html).toContain("Onsite staffing");
  });
  it("shows an empty prerequisite state", () => {
    const html = renderToStaticMarkup(<WorkflowPrerequisites items={[]}/>);
    expect(html).toContain("No prerequisites reported.");
  });
  it("renders blocked handoff with caller-owned action", () => {
    const html = renderToStaticMarkup(<WorkflowHandoff title="CAN review"
      blockedReason="Missing school opening evidence"
      action={<button type="button" disabled>Submit</button>}/>);
    expect(html).toContain("Blocked: Missing school opening evidence");
    expect(html).toContain("disabled");
  });
});
