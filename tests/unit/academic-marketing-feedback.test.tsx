import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { getSitePublicationDraftView } from "@/modules/sites/site-publication.functions";
import { AcademicProgramMarketingEditor } from "@/components/sites/AcademicProgramMarketingEditor";

const state = vi.hoisted(() => ({ refreshFailed: true }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/modules/sites/site-publication.functions", () => ({ setAcademicProgramMarketingStatus: vi.fn() }));
vi.mock("@/lib/mutation-feedback", () => ({
  useMutationFeedback: () => ({
    pending: false, refreshFailed: state.refreshFailed,
    notice: "Academic marketing approved.", error: state.refreshFailed ? "Page refresh failed." : "",
    run: vi.fn(), retryRefresh: vi.fn(),
  }),
}));

type Program = Awaited<ReturnType<typeof getSitePublicationDraftView>>["academicPrograms"][number];
const program: Program = {
  id: "program", name: "School Program", type: "full_school", status: "active",
  gradeRange: { min: "9", max: "12" }, deliveryModel: { onsite: true }, marketing: null,
};
describe("academic marketing mutation feedback", () => {
  it("shows a saved-but-refresh-failed outcome with refresh-only recovery", () => {
    const html = renderToStaticMarkup(<AcademicProgramMarketingEditor siteId="site" program={program}/>);
    expect(html).toContain("The command succeeded.");
    expect(html).toContain("Academic marketing approved.");
    expect(html).toContain("Retry refresh");
    expect(html).toContain("disabled");
  });
});
