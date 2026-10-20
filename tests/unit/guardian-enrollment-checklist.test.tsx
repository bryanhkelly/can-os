import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EnrollmentChecklistItems } from "@/components/enrollment/GuardianEnrollmentChecklist";
import type { getGuardianEnrollmentChecklist } from "@/modules/enrollment/guardian-enrollment-checklist.functions";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/modules/enrollment/guardian-enrollment-checklist.functions", () => ({ getGuardianEnrollmentChecklist: vi.fn() }));
vi.mock("@/modules/enrollment/enrollment-form.functions", () => ({
  submitGuardianEnrollmentForm: vi.fn(), decideEnrollmentForm: vi.fn(),
}));
vi.mock("@/modules/enrollment/r2-document-upload.functions", () => ({
  beginEnrollmentDocumentUpload: vi.fn(), finishEnrollmentDocumentUpload: vi.fn(),
  getEnrollmentDocumentDownload: vi.fn(), getEnrollmentDocumentUploadAvailability: vi.fn(),
}));
type Checklist = Awaited<ReturnType<typeof getGuardianEnrollmentChecklist>>;
const checklist: Checklist = { applicationId: "application", closed: false, synthetic: false, journeyStatus: "in_progress",
  requirements: [{ id: "requirement", title: "Enrollment evidence", blocking: true, status: "needs_you",
    reviewStatus: "rejected", correctionReason: "Please supply a clear copy.", form: null,
    documents: [
      { id: "older", fileName: "old.pdf", current: false, canDownload: false, reviewStatus: "rejected", uploadedAt: "2030-01-01" },
      { id: "current", fileName: "current.pdf", current: true, canDownload: true, reviewStatus: "rejected", uploadedAt: "2030-01-02" },
    ] }],
};
function render(data = checklist, uploadsEnabled = true) {
  return renderToStaticMarkup(<EnrollmentChecklistItems checklist={data} uploadsEnabled={uploadsEnabled}
    busy={null} files={{}} onFile={vi.fn()} onUpload={vi.fn()} onOpen={vi.fn()} onChanged={vi.fn()} />);
}
describe("guardian enrollment completion and corrections", () => {
  it("shows required status, correction instructions and superseded history without fake completion", () => {
    const html = render();
    expect(html).toContain("Enrollment evidence (required)");
    expect(html).toContain("Admissions instructions: Please supply a clear copy.");
    expect(html).toContain("old.pdf");
    expect(html).toContain("superseded");
    expect(html.match(/Open document/g)).toHaveLength(1);
    expect(html).toContain("Submit replacement document");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Activate enrollment");
  });
  it("offers no upload when deployment gates are disabled but retains review history", () => {
    const html = render(checklist, false);
    expect(html).toContain("Online document uploads are not enabled");
    expect(html).toContain("Contact admissions");
    expect(html).toContain("current.pdf");
    expect(html).not.toContain('type="file"');
  });
  it("keeps closed checklists read-only", () => {
    const html = render({ ...checklist, closed: true, journeyStatus: "active" });
    expect(html).toContain("historical record");
    expect(html).toContain("current.pdf");
    expect(html).not.toContain('type="file"');
  });
  it("distinguishes received evidence from completed enrollment", () => {
    const html = render({ ...checklist, requirements: [{ ...checklist.requirements[0]!, reviewStatus: "received",
      correctionReason: null }] });
    expect(html).toContain("Received - awaiting admissions review.");
    expect(html).not.toContain("Please supply a clear copy.");
    expect(html).not.toContain("Enrollment complete");
  });
  it("does not offer replacement of an accepted, completed requirement", () => {
    const html = render({ ...checklist, requirements: [{ ...checklist.requirements[0]!, status: "complete",
      reviewStatus: "accepted", correctionReason: null }] });
    expect(html).not.toContain('type="file"');
    expect(html).toContain("Requirement: complete");
  });
  it("explicitly explains unconfigured enrollment requirements", () => {
    expect(render({ ...checklist, requirements: [] })).toContain("No checklist requirements have been configured");
  });
});
