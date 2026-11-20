import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyInvitationForm } from "@/components/admissions/FamilyInvitationForm";
import { ClassSupplementForm } from "@/components/learning/ClassSupplementForm";
import { ExtendedSeasonDraftForm } from "@/components/operations/ExtendedSeasonDraftForm";

describe("V6.1 cross-feature form composition", () => {
  it("uses the canonical panel and form actions for eligible family invitations", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[{ id: "program-1", name: "Weekend learning" }]}
      draft={{ programId: "program-1", contacts: "", subject: "", introduction: "" }}
      busy={false} onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain('aria-label="Send a private receiving-school application invitation"');
    expect(html).toContain('data-action-footer="form"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Queue secure invitations");
    expect(html).not.toMatch(/rounded-(?:lg|xl|full)/);
  });

  it("shows the shared empty state without creating an unauthorized invitation form", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[]}
      draft={{ programId: "", contacts: "", subject: "", introduction: "" }}
      busy={false} onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain("No eligible Programs");
    expect(html).toContain('data-empty-kind="records"');
    expect(html).not.toContain("<form");
  });

  it("uses a shared panel and actions for the existing class-resource editor", () => {
    const html = renderToStaticMarkup(<ClassSupplementForm
      title="Reading guide" url="https://example.org/guide" kind="link"
      lessonId="" lessons={[]} busy={false}
      onTitleChange={() => undefined} onUrlChange={() => undefined}
      onKindChange={() => undefined} onLessonChange={() => undefined}
      onSubmit={() => undefined} />);
    expect(html).toContain('aria-label="Add class or lesson resource"');
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Add resource");
  });

  it("preserves the extended-season draft form while standardizing its action row", () => {
    const html = renderToStaticMarkup(<ExtendedSeasonDraftForm
      value={{ programId: "", offeringName: "", seasonName: "", activityType: "arts",
        startsOn: "", endsOn: "", capacity: 20 }}
      selectable={[]} busy={false} attempted={false}
      onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Save draft season");
    expect(html).toContain("Create a hosted noncredit summer or after-school Program");
  });

  it.each([
    "src/components/learning/ClassVideoUploadForm.tsx",
    "src/components/learning/ClassSupplementForm.tsx",
    "src/components/operations/ExtendedSeasonDraftForm.tsx",
    "src/components/admissions/FamilyInvitationForm.tsx",
    "src/components/admissions/AdmissionsInquiryForm.tsx",
    "src/components/enrollment/EnrollmentForm.tsx",
    "src/routes/operations.interest-events.tsx",
    "src/components/operations/LaunchConfigurationForm.tsx",
  ])("guards canonical form-action reuse in %s", filePath => {
    const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), "utf8");
    expect(source).toContain("<ActionFooter");
    expect(source).toContain('type="submit"');
    expect(source).not.toMatch(/<button\\b/);
  });
});
