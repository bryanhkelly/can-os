import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidencePicker } from "@/components/evidence/EvidencePicker";

const candidate = { id: "doc-a", fileName: "Signed agreement.pdf",
  verifiedAt: "2026-10-20T00:00:00.000Z", expiresAt: null };
const props = { label: "Agreement evidence", candidates: [candidate],
  value: "doc-a", onChange: () => {}, emptyMessage: "No eligible evidence." };
describe("shared evidence picker", () => {
  it("labels the control and presents verification and expiry metadata", () => {
    const html = renderToStaticMarkup(<EvidencePicker {...props}/>);
    expect(html).toContain("Signed agreement.pdf");
    expect(html).toContain("No recorded expiry");
    expect(html).toMatch(/label for="([^"]+)"/);
    expect(html).toContain('value="doc-a" selected=""');
  });
  it("hides stale candidates while loading or errored and offers read retry", () => {
    const loading = renderToStaticMarkup(<EvidencePicker {...props} loading/>);
    expect(loading).not.toContain("Signed agreement.pdf");
    const error = renderToStaticMarkup(<EvidencePicker {...props} error="Unavailable" onRetry={() => {}}/>);
    expect(error).toContain("Retry"); expect(error).not.toContain("<select");
  });
  it("does not represent an absent document as selected", () => {
    const html = renderToStaticMarkup(<EvidencePicker {...props} value="other-program-doc"/>);
    expect(html).toContain('value="" selected=""');
    expect(html).not.toContain("No recorded expiry");
  });
  it("explains an empty or truncated result without enabling selection", () => {
    const html = renderToStaticMarkup(<EvidencePicker {...props} candidates={[]} truncated/>);
    expect(html).toContain("No eligible evidence.");
    expect(html).toContain("latest 100"); expect(html).toContain("disabled");
  });
});
