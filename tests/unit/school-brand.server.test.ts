import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { readSchoolBrand } from "@/modules/sites/school-brand.server";

const state = vi.hoisted(() => ({ rows: [] as unknown[], content: vi.fn(), photos: vi.fn() }));
vi.mock("@/db/client", () => {
  const chain = { from: () => chain, leftJoin: () => chain, where: () => chain,
    limit: async () => state.rows };
  return { db: { select: () => chain } };
});
vi.mock("@/modules/sites/site-local-content.server", () => ({ readCurrentLocalContent: state.content }));
vi.mock("@/modules/sites/site-media-folder.server", () => ({ readApprovedSchoolSitePhotos: state.photos }));

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [{ name: "Valor School", slug: "valorschool", status: "published" }];
  state.content.mockResolvedValue({ content: { ...emptySiteLocalContent,
    branding: { ...emptySiteLocalContent.branding, paletteId: "heritage" } } });
  state.photos.mockResolvedValue([]);
});

describe("canonical school brand", () => {
  it("uses the canonical school name, published theme and illustrative template default", async () => {
    const brand = await readSchoolBrand("school-id");
    expect(brand).toMatchObject({ name: "Valor School", theme: { ink: "#162b45" },
      image: { src: "/school-template-previews/v1/heritage/hero.jpg" } });
    expect(new URL(brand!.websiteUrl!).hostname.split(".")[0]).toBe("valorschool");
    expect(state.content).toHaveBeenCalledWith("school-id");
  });

  it("does not expose a draft site URL or load public media for it", async () => {
    state.rows = [{ name: "Valor School", slug: "valorschool", status: "draft" }];
    expect(await readSchoolBrand("school-id")).toMatchObject({ websiteUrl: null,
      image: { src: "/school-template-previews/v1/heritage/hero.jpg" } });
    expect(state.photos).not.toHaveBeenCalled();
  });

  it("shares the website's owned, approved default image selection", async () => {
    const photo = { id: "11111111-1111-4111-8111-111111111111", siteId: "school-id",
      width: 1600, height: 900, tags: ["school", "community"], altText: "School courtyard",
      rightsStatus: "approved", subjectReleaseStatus: "not_required", mediaReviewStatus: "approved", sourceRevision: "v1" };
    state.photos.mockResolvedValue([photo]);
    expect(await readSchoolBrand("school-id")).toMatchObject({ image: { altText: "School courtyard" } });
    state.photos.mockResolvedValue([{ ...photo, rightsStatus: "pending" }]);
    expect(await readSchoolBrand("school-id")).toMatchObject({ image: { src: "/school-template-previews/v1/heritage/hero.jpg" } });
    state.photos.mockResolvedValue([{ ...photo, siteId: "another-school" }]);
    expect(await readSchoolBrand("school-id")).toMatchObject({ image: { src: "/school-template-previews/v1/heritage/hero.jpg" } });
  });

  it("resolves Modern typography and imagery consistently, preserving explicit fonts", async () => {
    const branding = { ...emptySiteLocalContent.branding, templateId: "modern" };
    state.content.mockResolvedValue({ content: { ...emptySiteLocalContent, branding } });
    const brand = await readSchoolBrand("school-id");
    expect(brand?.theme.displayFont).toBe(brand?.theme.bodyFont);
    expect(brand?.image?.src).toBe("/school-template-previews/v1/modern/hero.jpg");
    state.content.mockResolvedValue({ content: { ...emptySiteLocalContent,
      branding: { ...branding, headingFontId: "georgia" } } });
    expect((await readSchoolBrand("school-id"))?.theme.displayFont).toContain("Georgia");
  });

  it("returns no identity for a missing school", async () => {
    state.rows = [];
    expect(await readSchoolBrand("missing")).toBeNull();
    expect(state.content).not.toHaveBeenCalled();
  });
});