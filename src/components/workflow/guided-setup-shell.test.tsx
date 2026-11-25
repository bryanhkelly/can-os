import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedSetupProgress, GuidedSetupShell } from "./guided-setup-shell";

const steps = [
  { id: "hosting", title: "Hosting", status: "complete" as const },
  { id: "environment", title: "Learning Environment", status: "current" as const },
  { id: "story", title: "Purpose & Story", status: "upcoming" as const },
];

describe("V6.1 internal setup navigation", () => {
  it("distinguishes saved steps from the current and upcoming steps", () => {
    const html = renderToStaticMarkup(<GuidedSetupProgress steps={steps} />);
    expect(html).toContain("Complete");
    expect(html).toContain("Current step");
    expect(html).toContain("Not started");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("<button");
  });

  it("locks only interactive navigation during a save", () => {
    const html = renderToStaticMarkup(<GuidedSetupShell title="Site Information"
      progressLabel="Site Information sections" steps={steps}
      navigationDisabled onStepChange={() => {}}>
      <p>Saved Site information is retained.</p>
    </GuidedSetupShell>);
    expect(html).toContain('aria-label="Site Information sections"');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain("Saved Site information is retained.");
  });

  it("keeps a screen-reader label while suppressing a repeated page header", () => {
    const html = renderToStaticMarkup(<GuidedSetupShell title="Site Information"
      showHeader={false} description="Already in the page header." steps={steps}>
      <p>Workflow content</p>
    </GuidedSetupShell>);
    expect(html).toContain('aria-label="Site Information"');
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("Already in the page header.");
    expect(html).toContain("Workflow content");
    expect(html).toContain("Setup progress");
  });

  it("does not interpret a visited step as complete", () => {
    const html = renderToStaticMarkup(<GuidedSetupProgress steps={[
      { id: "one", title: "First", status: "current" },
      { id: "two", title: "Second", status: "upcoming" },
    ]} onStepChange={() => {}} />);
    expect(html).not.toContain("Complete");
    expect(html).toContain("Not started");
  });
});
