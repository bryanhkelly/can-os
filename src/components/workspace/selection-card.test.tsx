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
      title="Summer &amp; Breaks" detail="Seasonal learning" checked={false}
      disabled layout="vertical" onChange={() => {}} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Seasonal learning");
    expect(html).toContain("summer");
  });

  it("keeps compact options within the same component contract", () => {
    const html = renderToStaticMarkup(<SelectionCard kind="checkbox"
      title="Weekends" checked compact onChange={() => {}} />);
    expect(html).toContain("Weekends");
    expect(html).toContain("min-h-11");
    expect(html).toContain('checked=""');
  });
});
