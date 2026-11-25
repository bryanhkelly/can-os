import { encodeUuidForPath } from "@/domain/opaque-url-id";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { siteLaunchModules } from "@/components/launch-studio/LaunchStudioOverviewV61";

const site = { id: "9bdc982d-73b3-48bf-b0e3-66c2870b08f5", name: "Valor Learning Center" };

describe("single V6.1 Site Launch Studio", () => {
  it("renders one Site-scoped frame, four milestones and an authorized private preview link", () => {
    const html = renderToStaticMarkup(<LaunchSiteFrame site={site}><p>Overview content</p></LaunchSiteFrame>);
    expect(html).toContain("Valor Learning Center");
    expect(html).toContain("Launch Studio");
    expect(html).toContain("Establish");
    expect(html).toContain("Introduce");
    expect(html).toContain("Prepare");
    expect(html).toContain("Open");
    expect(html).toContain("/launch/site-preview?siteId="+encodeUuidForPath(site.id));
    expect(html).toContain("Overview content");
    expect(html).not.toContain("Launch Hub");
  });

  it("keeps website setup in Establish and Solution selection in Prepare", () => {
    expect(siteLaunchModules.find(item => item.id === "website-brand")?.stage).toBe("Establish");
    expect(siteLaunchModules.find(item => item.id === "program-catalog")?.stage).toBe("Prepare");
    expect(siteLaunchModules.find(item => item.id === "programs-audiences")?.stage).toBe("Establish");
  });

  it("uses canonical Site context, never a second new Site or tenant during module navigation", () => {
    const html = renderToStaticMarkup(<LaunchSiteFrame site={site} active="site-profile">
      <p>Authorized Site Profile</p>
    </LaunchSiteFrame>);
    expect(html).toContain("siteId="+site.id);
    expect(html).toContain("module=site-profile");
    expect(html).not.toContain("/schools/new");
    expect(html).not.toContain("/launch/hub/school");
  });
});
