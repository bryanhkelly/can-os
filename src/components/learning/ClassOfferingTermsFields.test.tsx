import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClassOfferingTermsFields, initialClassOfferingTermsForm } from "./ClassOfferingTermsFields";

describe("shared Class Offering terms editor", () => {
  it("renders the canonical default private assignment terms as controlled fields", () => {
    const html=renderToStaticMarkup(<ClassOfferingTermsFields
      value={initialClassOfferingTermsForm} onChange={() => {}}
      siteTimeZone="America/Los_Angeles" />);
    expect(html).toContain("Class Offering terms");
    expect(html).toContain("Allowed enrollment methods");
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("For-credit participation does not award credit");
    expect(html).not.toContain("Self-enrollment consent terms");
  });
  it("shows legal consent inputs when self-enrollment is selected", () => {
    const html=renderToStaticMarkup(<ClassOfferingTermsFields
      value={{ ...initialClassOfferingTermsForm, methods: ["self"] }}
      onChange={() => {}} siteTimeZone={null} />);
    expect(html).toContain("Self-enrollment consent terms");
    expect(html).toContain("Participation and data-use terms");
    expect(html).toContain("select an authorized Site with a configured time zone");
  });
});
