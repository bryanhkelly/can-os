import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelectionCard } from "./selection-card";

describe("V6.1 shared SelectionCard", () => {
  it("renders a labelled, checked radio within the owning group", () => {
    const html = renderToStaticMarkup(<SelectionCard kind="radio" name="site-host"
      value="same" title="Your organization" detail="The Site hosts its own activities"
      checked onChange={() => {}} />);
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="site-host"');
    expect(html).toContain('value="same"');
    expect(html).toContain('checked=""');
    expect(html).toContain("The Site hosts its own activities");
  });

  it("supports a disabled selection without making its description inaccessible", () => {
    const html = renderToStaticMarkup(<SelectionCard kind="checkbox" value="summer"
      title="Summer & Breaks" detail="Seasonal learning" checked={false}
      disabled onChange={() => {}} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Seasonal learning");
    expect(html).toContain("summer");
    expect(html).toContain("bg-muted/30");
    expect(html).not.toContain("bg-accent");
  });

  it("keeps compact options within the same component contract", () => {
    const html = renderToStaticMarkup(<SelectionCard kind="checkbox"
      title="Weekends" checked compact onChange={() => {}} />);
    expect(html).toContain("Weekends");
    expect(html).toContain("min-h-11");
    expect(html).toContain('checked=""');
  });
  it("shares the same checked surface for single and multiple choice cards", () => {
    const radio = renderToStaticMarkup(<SelectionCard kind="radio" name="site-host"
      title="Your organization" checked onChange={() => {}} />);
    const checkbox = renderToStaticMarkup(<SelectionCard kind="checkbox"
      title="After-school" checked onChange={() => {}} />);
    for (const html of [radio, checkbox]) {
      expect(html).toContain("border-primary bg-accent");
      expect(html).toContain("min-h-20 items-start");
    }
  });
});
