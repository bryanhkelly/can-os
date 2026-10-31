import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceWorkflow } from "./EvidenceWorkflow";
import { EvidenceHistory } from "./EvidenceHistory";
import { EvidenceReviewForm } from "./EvidenceReviewForm";
import { EvidenceUploader } from "./EvidenceUploader";

describe("shared evidence presentation", () => {
  it("announces rejection details and displays canonical status", () => {
    const html = renderToStaticMarkup(<EvidenceWorkflow title="Opening certificate"
      status="rejected" rejectionReason="Document expired"/>);
    expect(html).toContain("Opening certificate");
    expect(html).toContain("Document expired");
    expect(html).toContain('role="alert"');
  });

  it("renders version history without replacing older reviews", () => {
    const html = renderToStaticMarkup(<EvidenceHistory versions={[
      { id: "a", version: 1, fileName: "old.pdf", status: "rejected",
        isCurrent: false, reviewReason: "Needs signature" },
      { id: "b", version: 2, fileName: "new.pdf", status: "pending", isCurrent: true },
    ]}/>);
    expect(html).toContain("Version history (2)");
    expect(html).toContain("Needs signature");
    expect(html).toContain("superseded");
    expect(html).toContain("current");
  });

  it("disables review until a sufficiently long rationale is provided", () => {
    const html = renderToStaticMarkup(<EvidenceReviewForm onReview={async () => {}}/>);
    expect(html).toContain("disabled");
    expect(html).toContain("Review rationale");
    expect(html).toContain('minlength="10"');
  });

  it("renders disabled upload controls when deployment disables private uploads", () => {
    const html = renderToStaticMarkup(<EvidenceUploader disabled
      adapter={{ begin: async () => ({ key: "k", uploadUrl: "/private", uploadHeaders: {} }),
        finish: async () => {} }}
      makeInput={() => ({ fileName: "test.pdf", mimeType: "application/pdf" as const,
        size: 1, expiresAt: "2027-01-01" })}
      onUploaded={() => {}}/>);
    expect(html).toContain('type="file"');
    expect(html).toContain('type="date"');
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
