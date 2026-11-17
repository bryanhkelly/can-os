import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldTripFacts } from "@/components/field-trips/FieldTripFacts";

const trip = {
  departsAt: "2027-05-01T16:00:00.000Z",
  returnsAt: "2027-05-01T23:00:00.000Z",
  timezone: "America/Los_Angeles",
  deadline: null,
  feeAmountCents: null,
};

describe("V6.1 shared FieldTripFacts", () => {
  it("labels exactly the shared facts and preserves unknown/zero-fee fallbacks", () => {
    const html = renderToStaticMarkup(<FieldTripFacts trip={trip}/>);
    expect(html).toContain('aria-label="Field trip schedule and fee"');
    expect((html.match(/<dt\b/g) ?? []).length).toBe(4);
    expect((html.match(/<dd\b/g) ?? []).length).toBe(4);
    for (const label of ["Departure", "Return", "Permission deadline", "Fee"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("Before departure");
    expect(html).toContain("No fee");
    expect(html).not.toContain("permission_complete");
    expect(html).not.toMatch(/\brounded(?:-[\w-]+)?\b/);
  });

  it("formats published deadlines and fees without inferring consent or placement", () => {
    const html = renderToStaticMarkup(<FieldTripFacts trip={{
      ...trip,
      deadline: "2027-04-28T23:00:00.000Z",
      feeAmountCents: 1250,
    }}/>);
    expect(html).toContain("$12.50");
    expect(html).not.toContain("Before departure");
    expect(html).not.toContain("No fee");
    expect(html).not.toContain("Authorized to board");
  });

  it("uses the same presentation in student and guardian routes", () => {
    for (const path of ["src/routes/student.field-trips.tsx", "src/routes/guardian.field-trips.tsx"]) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      expect(source).toContain("<FieldTripFacts trip={item}/>");
      expect(source).not.toContain("<dl");
      expect(source).not.toContain("const money =");
    }
  });
});
