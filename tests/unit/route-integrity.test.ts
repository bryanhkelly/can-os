import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  workspaceLinks,
  workspaceHome,
} from "@/components/shell/WorkspaceNavigation";

/**
 * Route wiring integrity. Two failure classes this guards against:
 *
 * 1. A route file exists but src/routeTree.gen.ts was not regenerated, so
 *    the route silently 404s (or falls back) on the deployed build.
 * 2. Navigation links point at paths no route file implements.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const routesDir = join(repoRoot, "src", "routes");

/** "student.assignments.tsx" -> "/student/assignments"; "student.index.tsx" -> "/student" */
function routePathFor(file: string): string | null {
  const base = file.replace(/\.(tsx|ts)$/, "");
  if (base === "__root") return null;
  const segments = base.split(".");
  if (segments[segments.length - 1] === "index") segments.pop();
  return "/" + segments.join("/");
}

const routeFiles = readdirSync(routesDir).filter((f) => /\.(tsx|ts)$/.test(f));
const routePaths = new Set(
  routeFiles
    .map(routePathFor)
    .filter((p): p is string => p !== null),
);

function linkPath(target: string): string {
  return target.split("?")[0].replace(/\/$/, "") || "/";
}

describe("route tree freshness", () => {
  it("registers every route file in the generated route tree", () => {
    const tree = readFileSync(join(repoRoot, "src", "routeTree.gen.ts"), "utf8");
    const unregistered = routeFiles.filter(
      (file) => !tree.includes(`./routes/${file.replace(/\.(tsx|ts)$/, "")}`),
    );
    expect(
      unregistered,
      `route files missing from routeTree.gen.ts (stale generated tree — run the dev server or build to regenerate): ${unregistered.join(", ")}`,
    ).toEqual([]);
  });
});

describe("navigation link targets", () => {
  it("every primary navigation link resolves to a route", () => {
    const broken = Object.values(workspaceLinks).flat()
      .map((link) => link.path)
      .filter((to) => !routePaths.has(linkPath(to)));
    expect(broken, `nav links with no matching route file: ${broken.join(", ")}`).toEqual([]);
  });

  it("every persona home resolves to a route", () => {
    const broken = Object.values(workspaceHome).filter(
      (to) => !routePaths.has(linkPath(to)),
    );
    expect(broken).toEqual([]);
  });

  it("every static Link target in routes and components resolves to a route", () => {
    const broken: Array<{ file: string; target: string }> = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;
        const text = readFileSync(full, "utf8");
        // JSX to="/..." and navigation-config to:"/..." — a leading slash
        // marks a route target (state-machine `to:` values never have one).
        for (const match of text.matchAll(/\bto=["'](\/[^"']*)["']/g)) {
          const target = linkPath(match[1]);
          // Dynamic segments: /staff/students/$personId matches any concrete id.
          const matchesRoute = [...routePaths].some((route) => {
            const pattern = route.replace(/\$[^/]+/g, "[^/]+");
            return new RegExp(`^${pattern}/?$`).test(target);
          });
          if (!matchesRoute) {
            broken.push({ file: full.slice(repoRoot.length + 1), target: match[1] });
          }
        }
      }
    };
    scan(routesDir);
    scan(join(repoRoot, "src", "components"));
    expect(
      broken,
      `link targets with no matching route:\n${broken.map((b) => `  ${b.file} -> ${b.target}`).join("\n")}`,
    ).toEqual([]);
  });
});
