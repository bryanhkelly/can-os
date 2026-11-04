import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurriculumLibrary } from "@/components/learning/CurriculumLibrary";
import { CurriculumProgramNavigation } from "@/components/learning/CurriculumProgramNavigation";
import { schoolCourseOutline } from "@/domain/school-course-outline";
import { recommendCourseOption } from "@/domain/first-classroom";
import type { getCurriculumMarketplace } from "@/modules/learning/curriculum-marketplace.functions";
import { Route } from "@/routes/operations.curriculum";

type Marketplace = Awaited<ReturnType<typeof getCurriculumMarketplace>>;
type Loader = (input: { deps: { programId?: string } }) => Promise<unknown>;
const state = vi.hoisted(() => ({
  loader: null as Loader | null,
  data: null as unknown,
  programs: vi.fn(), marketplace: vi.fn(), studio: vi.fn(), publisherPacks: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { loader: Loader }) => {
    state.loader = options.loader;
    return { options, useLoaderData: () => state.data };
  },
  useRouter: () => ({ invalidate: vi.fn() }),
  useLocation: () => ({ pathname: "/operations/curriculum", searchStr: "", hash: "" }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, search, hash }: { children: ReactNode; to: string; search?: { programId?: string }; hash?: string }) =>
    <a href={`${to}${search?.programId ? `?programId=${search.programId}` : ""}${hash ? `#${hash}` : ""}`}>{children}</a>,
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: null }),
}));
vi.mock("@/modules/learning/curriculum-marketplace.functions", () => ({
  getCurriculumAdopterPrograms: state.programs, getCurriculumMarketplace: state.marketplace,
}));
vi.mock("@/modules/learning/curriculum-authoring.functions", () => ({
  getCurriculumStudio: state.studio, createAuthoredCourse: vi.fn(), startCurriculumDraft: vi.fn(),
  saveAuthoredCurriculum: vi.fn(), saveAuthoredLesson: vi.fn(), publishAuthoredCurriculum: vi.fn(),
}));
vi.mock("@/modules/learning/publisher-pack-authoring.functions", () => ({
  getPublisherPackStudio: state.publisherPacks, createAuthoredPublisherPack: vi.fn(),
  startPublisherPackDraft: vi.fn(), saveAuthoredPublisherPack: vi.fn(), publishAuthoredPublisherPack: vi.fn(),
}));

const curriculum = { learning: { version: 1, syllabus: "Original synthetic science outline.", resources: [],
  modules: [{ id: "unit-1", title: "Observe", lessons: [{ id: "lesson-1", title: "Evidence", body: "Observe carefully.", resources: [] }] }] } };
function market(programId = "program-1"): Marketplace {
  return {
    program: { id: programId, name: `Academy ${programId}`, siteId: "site-1" },
    canPublish: false, overlays: [], sections: [],
    packs: [{
      id: "pack-1", slug: "core", name: "High School Core", description: "Original synthetic curriculum.",
      publisherOrganizationId: "publisher-1", publisherName: "Test Publisher", licenseCode: "CC0",
      versionId: "release-1", version: 1, entitlement: "active", adoption: { versionId: "release-1", status: "active" },
      courses: [{
        packVersionId: "release-1", courseVersionId: "course-1", code: "SCI", title: "Science", subject: "Science", position: 0,
        preview: schoolCourseOutline(curriculum),
        recommendation: recommendCourseOption({ origin: "adopted", published: true, licenseActive: true, adoptionActive: true, curriculum }),
      }],
    }],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.data = null;
  state.programs.mockResolvedValue([{ id: "program-1", name: "Academy" }]);
  state.marketplace.mockImplementation(async ({ data }: { data: { programId: string } }) => market(data.programId));
});

describe("curriculum library cards", () => {
  it("immediately displays the exact selected release and included courses without disclosure clicks", () => {
    const html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[market()]} />);
    expect(html).toContain("Your curriculum");
    expect(html).toContain("Selected curriculum");
    expect(html).toContain("High School Core");
    expect(html).toContain("Science");
    expect(html).toContain("1 unit");
    expect(html).toContain("1 lesson");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("haven&#x27;t selected");
    expect(html).toContain("?programId=program-1#curriculum-pack-release-1");
  });
  it("shows a clear empty selection and browse cards for installed but unadopted packs", () => {
    const data = market();
    data.packs[0]!.adoption = null;
    const html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[data]} />);
    expect(html).toContain("You haven&#x27;t selected a curriculum");
    expect(html).toContain("Choose curriculum");
    expect(html).toContain("In your library");
    expect(html).toContain("Review curriculum");
    expect(html).not.toContain("Selected curriculum");
  });
  it("keeps a previous selection visible with an explicit revoked-license warning", () => {
    const data = market();
    data.packs[0]!.entitlement = "revoked";
    const html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[data]} />);
    expect(html).toContain("Selected curriculum");
    expect(html).toContain("License revoked");
    expect(html).toContain("Publisher review is required");
  });
  it("does not label a newer release or an inactive adoption as selected", () => {
    const data = market();
    data.packs[0]!.adoption = { versionId: "older-release", status: "active" };
    let html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[data]} />);
    expect(html).not.toContain("Selected curriculum");
    expect(html).toContain("Another release is selected");
    data.packs[0]!.adoption = { versionId: "release-1", status: "retired" };
    html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[data]} />);
    expect(html).not.toContain("Selected curriculum");
    expect(html).toContain("Previous selection is retired");
  });
  it("renders a real catalog-empty state, not invented curriculum", () => {
    const data = market();
    data.packs = [];
    const html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[data]} />);
    expect(html).toContain("You haven&#x27;t selected a curriculum");
    expect(html).toContain("No published curriculum is available");
    expect(html).not.toContain("<article");
  });
  it("puts prior selections before empty programs and browsing, even when another program comes first", () => {
    const unselected = market("first");
    unselected.packs[0]!.adoption = null;
    const html = renderToStaticMarkup(<CurriculumLibrary marketplaces={[unselected, market("second")]} />);
    expect(html.indexOf("Selected curriculum")).toBeLessThan(html.indexOf("You haven&#x27;t selected"));
    expect(html.indexOf("Selected curriculum")).toBeLessThan(html.indexOf("Review curriculum"));
  });
  it("uses Curriculum rather than Studio for the return navigation", () => {
    const html = renderToStaticMarkup(<CurriculumProgramNavigation programs={[]} selectedProgramId="program-1" canPublish />);
    expect(html).toContain(">Curriculum</a>");
    expect(html).not.toContain("Studio");
  });
});

describe("curriculum landing loader", () => {
  it("loads selected curriculum across authorized programs without an initial program click or publisher grant", async () => {
    state.programs.mockResolvedValue([{ id: "program-1", name: "First" }, { id: "program-2", name: "Second" }]);
    const outcome = await state.loader!({ deps: {} });
    expect(outcome).toMatchObject({ ok: true, data: { marketplaces: [market("program-1"), market("program-2")], studio: null, publisherPacks: null } });
    expect(state.studio).not.toHaveBeenCalled();
    expect(state.publisherPacks).not.toHaveBeenCalled();
    state.data = outcome;
    const Page = Route.options.component!;
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain(">Curriculum</h1>");
    expect(html).not.toContain("Studio");
    expect(html).not.toContain("Create course");
    expect((html.match(/Selected curriculum/g) ?? [])).toHaveLength(2);
  });
  it("passes an explicit program to the canonical authorized read instead of silently switching scope", async () => {
    await state.loader!({ deps: { programId: "program-2" } });
    expect(state.marketplace).toHaveBeenCalledExactlyOnceWith({ data: { programId: "program-2" } });
  });
  it("preserves publisher tools as a closed secondary disclosure", async () => {
    const data = market();
    data.canPublish = true;
    state.marketplace.mockResolvedValue(data);
    state.studio.mockResolvedValue({ programId: "program-1", courses: [] });
    state.publisherPacks.mockResolvedValue({ programId: "program-1", courses: [], packs: [] });
    state.data = await state.loader!({ deps: {} });
    const Page = Route.options.component!;
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Manage and publish curriculum");
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html.indexOf("Selected curriculum")).toBeLessThan(html.indexOf("Create course"));
    expect(state.studio).toHaveBeenCalledExactlyOnceWith({ data: { programId: "program-1" } });
  });
  it("reports failed authorized reads rather than showing a false empty selection", async () => {
    state.marketplace.mockRejectedValue({ code: "FORBIDDEN", message: "Denied" });
    const outcome = await state.loader!({ deps: {} });
    expect(outcome).toMatchObject({ ok: false });
    state.data = outcome;
    const Page = Route.options.component!;
    expect(renderToStaticMarkup(<Page />)).not.toContain("You haven&#x27;t selected");
  });
});
