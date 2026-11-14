import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeNavigation } from "@/components/shell/route-navigation";

const cases = [
  ["canonical.capability-lab.tsx", "/canonical/capability-lab"],
  ["canonical.lab.noncredit.tsx", "/canonical/lab/noncredit"],
  ["canonical.lab.surveys.tsx", "/canonical/lab/surveys"],
  ["canonical.lab.credentials.tsx", "/canonical/lab/credentials"],
  ["canonical.lab.deployments.tsx", "/canonical/lab/deployments"],
  ["canonical.lab.readiness.tsx", "/canonical/lab/readiness"],
] as const;

describe("temporary canonical Capability Lab route boundaries", () => {
  const contracts = JSON.parse(readFileSync(resolve("docs/platform-route-contracts.json"), "utf8"))
    as { routes: Array<{file: string; route: string; owner: string; verification: string; roleJourney: string; readBoundary: string; writeBoundary: string}> };
  const fixture = JSON.parse(readFileSync(resolve("scripts/seeds/fixture-manifest.json"), "utf8"))
    as { routes: Record<string, {fixtureRequired?: boolean; rationale?: string}> };

  it.each(cases)("%s remains an internal temporary route", (file, route) => {
    const contract = contracts.routes.find(row => row.file === "src/routes/" + file);
    expect(contract).toBeDefined();
    expect(contract?.route).toBe(route);
    expect(contract?.owner).toBe("operations");
    expect(contract?.verification).toBe("pending");
    expect(contract?.roleJourney).not.toBe("pending");
    expect(contract?.readBoundary).not.toBe("pending");
    expect(contract?.writeBoundary).not.toBe("pending");
    expect(routeNavigation[route]).toEqual(expect.objectContaining({ visibility: "hidden", personas: [] }));
    expect(fixture.routes[route]?.fixtureRequired).toBe(false);
    expect(fixture.routes[route]?.rationale?.length).toBeGreaterThan(80);
  });
});
