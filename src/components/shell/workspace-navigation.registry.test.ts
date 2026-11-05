import { describe, expect, it } from "vitest";
import { getActiveWorkspacePath, workspaceLinks } from "./workspace-navigation.registry";
import { routeNavigation } from "./route-navigation";
import { roleCapabilities } from "@/domain/access-context";

describe("generated workspace navigation", () => {
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
      "/operations/launch/00000000-0000-4000-8000-000000000001",
      "/operations/school-years/00000000-0000-4000-8000-000000000001",
      "/operations/school-years/new",
    ]) {
      const owner = path.startsWith("/operations/launch") || path === "/operations/interest-events"
        ? "/operations/launch"
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