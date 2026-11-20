import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormActions } from "@/components/workspace/form-page";

describe("shared FormActions in full page and embedded Launch Studio", () => {
  it("renders an embedded primary submit without requiring a Cancel link", () => {
    const html = renderToStaticMarkup(
      <FormActions submitLabel="Create school year"
        pendingLabel="Creating…" pending={false} cancel={false} />,
    );
    expect(html).toContain("Create school year");
    expect(html).not.toContain("Cancel");
  });

  it("disables standalone Cancel navigation during pending submissions", () => {
    const html = renderToStaticMarkup(
      <FormActions submitLabel="Create school year"
        pendingLabel="Creating…" pending
        cancel={<a href="/operations/school-years">Cancel</a>} />,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("pointer-events-none");
  });

  it("retains a standalone Cancel action", () => {
    const html = renderToStaticMarkup(
      <FormActions submitLabel="Create school year"
        pendingLabel="Creating…" pending={false}
        cancel={<a href="/operations/school-years">Cancel</a>} />,
    );
    expect(html).toContain("Create school year");
    expect(html).toContain('href="/operations/school-years"');
    expect(html).toContain("Cancel");
  });
});
