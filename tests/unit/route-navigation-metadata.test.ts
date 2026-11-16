import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeNavigation } from "@/components/shell/route-navigation";
import { getActiveWorkspacePath, workspaceLinks } from "@/components/shell/workspace-navigation.registry";

describe("route navigation metadata", () => {
  it("classifies every generated TanStack destination", () => {
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    const routes = tree.split("export interface FileRoutesByTo {")[1]!.split("export interface FileRoutesById")[0]!;
    const paths = [...routes.matchAll(/'([^']+)':/g)].map(match => match[1]);
    expect(Object.keys(routeNavigation).sort()).toEqual(paths.sort());
  });
  it("fails for unclassified route source even before route-tree regeneration", () => {
    const paths = readdirSync("src/routes").flatMap(file => {
      const source = readFileSync("src/routes/" + file, "utf8");
      const match = source.match(/createFileRoute\(["']([^"']+)["']\)/);
      return match ? [match[1]!.replace(/_(?=\/|$)/g, "").replace(/\/$/, "") || "/"] : [];
    });
    expect(paths.filter(path => !Object.hasOwn(routeNavigation, path))).toEqual([]);
  });
  it("requires each navigable persona's primary owner to exist in its navigation", () => {
    for (const [path, metadata] of Object.entries(routeNavigation)) {
      if (metadata.visibility !== "navigation") {
        expect(metadata.reason.length, path).toBeGreaterThan(0); continue;
      }
      expect(metadata.personas.length, path).toBeGreaterThan(0);
      for (const role of metadata.personas) {
        const owner = typeof metadata.owner === "string" ? metadata.owner : metadata.owner[role];
        expect(workspaceLinks[role].some(item => item.path === owner), path + ":" + role).toBe(true);
      }
    }
  });
  it("owns Interest Events under Launch for both school administrator personas", () => {
    for (const role of ["site_admin", "registrar"] as const) {
      expect(workspaceLinks[role].some(item => item.path === "/launch/site")).toBe(true);
      expect(getActiveWorkspacePath(workspaceLinks[role], "/operations/interest-events")).toBe("/launch/site");
    }
  });
});