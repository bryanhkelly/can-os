import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeNavigation } from "@/components/shell/route-navigation";

type RouteContract = {
  file: string;
  route: string;
  owner: string;
  verification: string;
  readBoundary: string;
  writeBoundary: string;
  roleJourney: string;
};

const routes = [
  ["src/routes/canonical.blueprints.tsx", "/canonical/blueprints"],
  ["src/routes/canonical.blueprint-reviews.tsx", "/canonical/blueprint-reviews"],
] as const;

describe("native canonical Blueprint route registration", () => {
  const manifest = JSON.parse(readFileSync(resolve("docs/platform-route-contracts.json"), "utf8"))
    as { routes: RouteContract[] };

  it.each(routes)("%s is present in the owned route inventory and excluded from legacy navigation", (file, route) => {
    const contract = manifest.routes.find(item => item.file === file);
    expect(contract).toBeDefined();
    expect(contract?.route).toBe(route);
    expect(contract?.owner).toBe("blueprints");
    expect(contract?.verification).toBe("pending");
    expect(contract?.roleJourney).not.toBe("pending");
    expect(contract?.readBoundary).not.toBe("pending");
    expect(contract?.writeBoundary).not.toBe("pending");
    const fixture = JSON.parse(readFileSync(resolve("scripts/seeds/fixture-manifest.json"), "utf8"))
      as { routes: Record<string, { fixtureRequired?: boolean; rationale?: string }> };
    expect(fixture.routes[route]?.fixtureRequired).toBe(false);
    expect(fixture.routes[route]?.rationale?.length).toBeGreaterThan(80);
    expect(routeNavigation[route]).toEqual(expect.objectContaining({
      visibility: "hidden",
      personas: [],
    }));
  });
});
