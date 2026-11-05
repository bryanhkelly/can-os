import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolProfile, type SchoolProfileData } from "@/components/operations/SchoolProfile";

const listMySites = vi.fn();
vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  Link: ({ children, to, params, className, "aria-label": label }: {
    children: ReactNode; to: string; params?: Record<string, string>; className?: string; "aria-label"?: string;
  }) => <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace("$" + key, value), to)}
    className={className} aria-label={label}>{children}</a>,
}));
vi.mock("@/modules/operations/site-directory.functions", () => ({ listMySites: () => listMySites() }));

const site = {
  id: "site-1", organizationId: "org-1", name: "Valor School", slug: "valor", timezone: "America/Chicago",
  organization: { id: "org-1", name: "Valor Church" },
  physicalLocation: { value: null, configurationStatus: "missing" },
  contact: { value: { displayName: "Front office", email: "office@valor.example", phone: "" }, configurationStatus: "church_supplied" },
  publication: { status: "unconfigured", canPublish: true },
  programs: [
    { id: "p1", name: "Upper School", type: "church_hosted_academy", status: "active", gradeRange: { min: "9", max: "12" } },
    { id: "p2", name: "Middle School", type: "church_hosted_academy", status: "draft", gradeRange: { min: "6", max: "8" } },
  ],
} as unknown as SchoolProfileData["site"];

const render = (overrides: Partial<SchoolProfileData> = {}) => renderToStaticMarkup(<SchoolProfile data={{
  site, organizationName: "Valor Church", siteCount: 1, activeStudents: { p1: 12 }, ...overrides,
}} />);

describe("School profile", () => {
  it("preserves the profile while explicitly warning that the directory count is unavailable", () => {
    const html = render({ siteCount: null });
    expect(html).toContain("Valor School");
    expect(html).toContain("number of authorized schools could not be verified");
    expect(html).toContain('href="/sites"');
  });
  it("names the school once and shows only authoritative counts", () => {
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Valor School");
    expect(html).toContain("12 active students");
    expect(html).toContain("0 active students");
    expect(html).not.toMatch(/>—</);
    expect(html).not.toMatch(/demo/i);
  });

  it("hides the enrollment total when the authoritative count is unavailable", () => {
    const html = render({ activeStudents: null });
    expect(html).not.toContain("Active students");
    expect(html).not.toContain("active student");
  });

  it("states missing facts plainly instead of inventing them", () => {
    const html = render();
    expect(html).toContain("No address recorded");
    expect(html).toContain("Front office");
    expect(html).toContain("appear publicly only after website review");
    expect(html).toContain("Not set up");
  });

  it("links to the owning workflows instead of editing in place", () => {
    const html = render();
    expect(html).not.toContain("<form");
    for (const href of ["/operations/launch", "/operations/school-years", "/sites/site-1/publish", "/sites/site-1/parent-information", "/sites/site-1"])
      expect(html).toContain(`href="${href}"`);
    expect(html.match(/ bg-primary /g)).toBeNull();
  });

  it("hides website management from viewers without a site publisher grant", () => {
    const html = render({ site: { ...site, publication: { ...site.publication, canPublish: false } } });
    expect(html).toContain("Not set up");
    expect(html).toContain("A site publisher manages it.");
    expect(html).not.toContain("/publish");
    expect(html).not.toContain("/parent-information");
  });

  it("offers the directory only when the workspace has several schools", () => {
    expect(render()).not.toContain("All schools");
    expect(render({ siteCount: 2 })).toContain('href="/sites"');
  });
});

describe("Schools directory", () => {
  beforeEach(() => listMySites.mockReset());
  const load = async () => {
    const { Route } = await import("@/routes/sites.index");
    return (Route.options.loader as unknown as () => Promise<unknown>)();
  };

  it("opens the profile directly when the workspace has one school", async () => {
    listMySites.mockResolvedValue([{ id: "site-1", name: "Valor School" }]);
    await expect(load()).rejects.toMatchObject({ options: { to: "/sites/$siteId/profile", params: { siteId: "site-1" } } });
  });

  it("lists schools when the workspace spans several", async () => {
    listMySites.mockResolvedValue([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    await expect(load()).resolves.toMatchObject({ ok: true, data: [{ id: "a" }, { id: "b" }] });
  });
});
