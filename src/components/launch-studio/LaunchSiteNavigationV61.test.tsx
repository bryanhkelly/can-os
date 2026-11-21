import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LaunchSiteNavigation } from "./LaunchSiteNavigationV61";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search, children, ...rest }: {
    to: string; params?: Record<string, string>; search?: Record<string, string>;
    children: ReactNode; [key: string]: unknown;
  }) => {
    const path = to.replace(/\$([^/]+)/g, (_, key: string) => params?.[key] ?? key);
    const query = search ? "?" + new URLSearchParams(search).toString() : "";
    return <a href={path + query} {...rest}>{children}</a>;
  },
}));

const props = {
  site: { id: "00000000-0000-4000-8000-000000000121", name: "Test Learning Site" },
  active: "site-information",
  expanded: "Shape",
  instance: "desktop" as const,
  stagePanelBaseId: "launch-navigation",
  onToggleStage: vi.fn(),
  onNavigate: vi.fn(),
};

describe("shared Launch Studio Site navigation", () => {
  it("exposes the same Site-scoped module links for desktop and drawer", () => {
    const desktop = renderToStaticMarkup(<LaunchSiteNavigation {...props}/>);
    const drawer = renderToStaticMarkup(<LaunchSiteNavigation {...props} instance="drawer"/>);
    for (const html of [desktop, drawer]) {
      expect(html).toContain("Test Learning Site");
      expect(html).toContain("Site Information");
      expect(html).toContain("Programs &amp; Audiences");
      expect(html).toContain("Site Workspace");
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("siteId=00000000-0000-4000-8000-000000000121");
    }
    expect(desktop).toContain("launch-navigation-desktop-Shape");
    expect(drawer).toContain("launch-navigation-drawer-Shape");
  });

  it("renders four stages without granting capability or completion", () => {
    const html = renderToStaticMarkup(<LaunchSiteNavigation {...props} expanded="Prepare"/>);
    for (const stage of ["Shape", "Share", "Prepare", "Launch"]) {
      expect(html).toContain(stage);
    }
    expect(html).toContain("Program Catalog");
    expect(html).toContain("Opening Checklist");
    expect(html).toContain("1. Shape");
    expect(html).not.toContain("Approved to open");
  });
});
