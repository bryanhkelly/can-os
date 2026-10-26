import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OperatingAgreementEvidencePicker } from "@/components/networks/OperatingAgreementEvidencePicker";

vi.mock("@/modules/programs/program-site-authorization.functions", () => ({
  listOperatingAgreementEvidenceFn: vi.fn(),
}));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25")); });
afterEach(() => vi.useRealTimers());
describe("operating agreement picker scopes cached metadata", () => {
  function render(authorizationId: string, through: string) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["operating-agreement-evidence", "request-a", "2030-01-01T00:00:00.000Z"], {
      candidates: [{ id: "doc-a", fileName: "Church A agreement",
        verifiedAt: "2026-01-01T00:00:00.000Z", expiresAt: null }], truncated: false,
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <OperatingAgreementEvidencePicker authorizationId={authorizationId}
        through={through} value="doc-a" onChange={() => {}} disabled={false}/>
    </QueryClientProvider>);
    client.clear(); return html;
  }
  it("renders eligible metadata for the matching request and period", () => {
    expect(render("request-a", "2030-01-01")).toContain("Church A agreement");
  });
  it("does not reuse another request's or end date's evidence", () => {
    for (const html of [render("request-b", "2030-01-01"), render("request-a", "2032-01-01")]) {
      expect(html).not.toContain("Church A agreement");
      expect(html).toContain("Loading eligible evidence");
    }
  });
  it("requires a future end date before offering evidence", () => {
    for (const through of ["", "invalid", "2025-01-01"]) {
      const html = render("request-a", through);
      expect(html).toContain("Choose a future exclusive end date");
      expect(html).not.toContain("<select");
    }
  });
});
