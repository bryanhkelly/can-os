import { describe, expect, it } from "vitest";
import { getActiveWorkspacePath, getWorkspaceHome, workspaceDestination, workspaceLinks } from "./workspace-navigation.registry";
import { routeNavigation } from "./route-navigation";
import { roleCapabilities } from "@/domain/access-context";

describe("generated workspace navigation", () => {
  const siteId = "00000000-0000-4000-8000-000000000001";
  const programId = "00000000-0000-4000-8000-000000000002";
  const section = "00000000-0000-4000-8000-000000000003";

  it("preserves only the destination's supported institutional context", () => {
    const search = `?siteId=${siteId}&programId=${programId}&section=${section}&action=private&thread=private`;
    expect(workspaceDestination("/launch/school", search)).toBe(`/launch/school?siteId=${siteId}&programId=${programId}`);
    expect(workspaceDestination("/operations/curriculum", search)).toBe(`/operations/curriculum?programId=${programId}`);
    expect(workspaceDestination("/messages", search)).toBe("/messages");
  });

  it("preserves school and Program selections only where the destination accepts them", () => {
    const search = `?siteId=${siteId}&programId=${programId}&section=${section}`;
    for (const path of ["/admissions", "/staff/students", "/operations/school-years", "/operations/insights", "/operations/interest-events", "/launch/hub/school", "/site-website"]) {
      expect(workspaceDestination(path, search)).toBe(`${path}?siteId=${siteId}&programId=${programId}`);
    }
    expect(workspaceDestination("/settings", search)).toBe(`/settings?siteId=${siteId}`);
    expect(workspaceDestination("/staff/attendance", search)).toBe(`/staff/attendance?programId=${programId}`);
    expect(workspaceDestination("/operations/curriculum", search)).toBe(`/operations/curriculum?programId=${programId}`);
  });

  it("keeps unauthorized roles out of guarded navigation", () => {
    expect(workspaceLinks.site_leader.some(item => item.path === "/site-website" || item.path === "/operations/workflows")).toBe(false);
    expect(workspaceLinks.network_admin.some(item => item.path === "/operations/workflows")).toBe(false);
    expect(workspaceLinks.site_website_editor.some(item => item.path === "/site-website")).toBe(true);
    expect(getWorkspaceHome("academic_content_creator")).toBe("/canonical/content");
    expect(getWorkspaceHome("academic_content_reviewer")).toBe("/canonical/content-reviews");
    expect(workspaceLinks.academic_content_creator[0].path).toBe("/canonical/content");
    expect(workspaceLinks.academic_content_reviewer[0].path).toBe("/canonical/content-reviews");
    expect(roleCapabilities.academic_content_creator).not.toContain("student:read");
    expect(roleCapabilities.academic_content_reviewer).not.toContain("student:read");
    const workflows = routeNavigation["/operations/workflows"];
    expect(workflows.visibility).toBe("navigation");
    if (workflows.visibility === "navigation") expect(workflows.personas).toEqual(["registrar", "site_admin"]);
  });

  it("keeps class context across learning, grading, and calendar destinations", () => {
    for (const path of ["/classes", "/student/courses", "/teacher/gradebook", "/guardian/students", "/calendar"]) {
      expect(workspaceDestination(path, `?section=${section}&assessment=selected&tab=grades`))
        .toBe(`${path}?section=${section}`);
    }
  });

  it("drops malformed context before navigating into strict route validators", () => {
    expect(workspaceDestination("/classes", "?section=invalid")).toBe("/classes");
    expect(workspaceDestination("/home", `?siteId=invalid&programId=${programId}`)).toBe(`/home?programId=${programId}`);
  });

  it("gives every verified workspace one Settings link, without adding a new settings state engine", () => {
    for (const links of Object.values(workspaceLinks)) {
      expect(links.filter(item => item.path === "/settings")).toHaveLength(1);
      expect(links.find(item => item.path === "/settings")?.title).toBe("Settings");
    }
  });

  it("shows Messages only for roles with the communication capability", () => {
    for (const [role, links] of Object.entries(workspaceLinks)) {
      expect(links.filter(item => item.path === "/home")).toHaveLength(1);
      expect(links.some(item => item.path === "/messages"))
        .toBe(roleCapabilities[role]?.includes("communication.send") === true);
    }
  });

  it("keeps Site profile visibility specific to Site Admin", () => {
    expect(workspaceLinks.site_admin.some(item => item.path === "/sites")).toBe(true);
    expect(workspaceLinks.registrar.some(item => item.path === "/sites")).toBe(false);
  });

  it("routes jurisdiction reviewers to their own home without steward navigation", () => {
    expect(workspaceLinks.can_jurisdiction_reviewer[0]).toMatchObject({ title: "Home", path: "/home" });
    expect(workspaceLinks.can_jurisdiction_reviewer.some(item => item.path === "/operations/jurisdiction-profiles")).toBe(false);
    expect(workspaceLinks.can_network_steward.some(item => item.path === "/operations/jurisdiction-profiles")).toBe(true);
  });

  it("assigns explicit nested operations journeys to administrator destinations", () => {
    for (const path of [
      "/operations/interest-events",
      "/launch/school/00000000-0000-4000-8000-000000000001",
      "/operations/school-years/00000000-0000-4000-8000-000000000001",
      "/operations/school-years/new",
    ]) {
      const owner = path.startsWith("/launch/school") || path === "/operations/interest-events"
        ? "/launch/school"
        : path.startsWith("/operations/school-years") ? "/operations/school-years" : "/home";
      expect(getActiveWorkspacePath(workspaceLinks.site_admin, path)).toBe(owner);
      expect(getActiveWorkspacePath(workspaceLinks.registrar, path)).toBe(owner);
    }
    expect(getActiveWorkspacePath(workspaceLinks.site_leader, "/operations/interest-events")).toBeUndefined();
    expect(getActiveWorkspacePath(workspaceLinks.network_admin, "/operations/interest-events")).toBeUndefined();
  });

  it("resolves every navigable route to its metadata-declared owner", () => {
    for (const [path, metadata] of Object.entries(routeNavigation)) {
      if (metadata.visibility !== "navigation") continue;
      for (const role of metadata.personas) {
        const owner = typeof metadata.owner === "string" ? metadata.owner : metadata.owner[role];
        expect(getActiveWorkspacePath(workspaceLinks[role], path), `${role} ${path}`).toBe(owner);
      }
    }
  });
});