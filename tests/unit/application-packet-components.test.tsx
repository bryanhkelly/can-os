import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApplicationPacketEditor } from "@/components/enrollment/ApplicationPacketEditor";
import { ApplicationPacketReview } from "@/components/enrollment/ApplicationPacketReview";
import { emptyApplicationPacket } from "@/domain/application-packet";

describe("application packet presentation", () => {
  it("provides a sectioned workspace with core student fields and constrained grades", () => {
    const html = renderToStaticMarkup(<ApplicationPacketEditor application={null} busy={false} open
      gradeRange={{ min: "9", max: "12" }} onSave={vi.fn()} onSubmit={vi.fn()} onNew={vi.fn()} onDirtyChange={vi.fn()}/>);
    for (const title of ["Instructions", "Student information", "Family and households", "Previous schools and interests", "Review and submit"])
      expect(html).toContain(title);
    expect(html).toContain("Date of birth");
    expect(html).toContain("Requested school year");
    expect(html).not.toContain('<option value="K"');
    expect(html).not.toContain("Unsaved changes");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('border-red-600');
    expect(html).toContain('Enter a date of birth before today.');
  });
  it("does not fabricate a completed packet for an old application", () => {
    expect(renderToStaticMarkup(<ApplicationPacketReview packet={null} statement="Earlier statement"/>))
      .toContain("has not been completed");
  });
  it("renders applicant-supplied family and academic history without granting authority", () => {
    const packet = emptyApplicationPacket();
    packet.schoolYear = "2026-2027";
    packet.households[0]!.name = "Example Household";
    packet.households[0]!.contacts[0]!.firstName = "Example Contact";
    packet.history.schools = [{ name: "Example Middle School", location: "Example City", grade: "8",
      from: "", to: "", reasonForLeaving: "Entering high school" }];
    const html = renderToStaticMarkup(<ApplicationPacketReview packet={packet} statement="Interested in science"/>);
    for (const text of ["Example Household", "Example Contact", "Example Middle School", "Interested in science",
      "not verified guardians", "not an official transcript"]) expect(html).toContain(text);
  });
});
