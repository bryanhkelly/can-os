import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

/**
 * Static wiring inventory for the fourteen routes added to the fixture manifest.
 * This verifies source ownership and delegation, not authenticated runtime or browser acceptance.
 */
const splitPages = [
  ["admin_.invite.tsx", "/admin_/invite", "ScopedAdminConsole", 'mode="invite"'],
  ["admin_.people.tsx", "/admin_/people", "ScopedAdminConsole", 'mode="people"'],
  ["admissions.intake_.new.tsx", "/admissions/intake_/new", "createAdmissionsInquiry", "safeLoader"],
  ["operations.curriculum-marketplace_.imports.tsx", "/operations/curriculum-marketplace_/imports", "loadMarketplace", 'mode="imports"'],
  ["operations.curriculum-marketplace_.resources.tsx", "/operations/curriculum-marketplace_/resources", "loadMarketplace", 'mode="resources"'],
  ["operations.curriculum-marketplace_.roster.tsx", "/operations/curriculum-marketplace_/roster", "loadMarketplace", 'mode="roster"'],
  ["operations.curriculum_.$courseId.tsx", "/operations/curriculum_/$courseId", "loadCurriculum", 'mode="author"'],
  ["operations.curriculum_.new.tsx", "/operations/curriculum_/new", "loadCurriculum", 'mode="create"'],
  ["operations.curriculum_.publishing.tsx", "/operations/curriculum_/publishing", "loadCurriculum", 'mode="publish"'],
  ["operations.family-alerts_.compose.tsx", "/operations/family-alerts_/compose", "getSchoolFamilyAlerts", 'mode="compose"'],
  ["operations.field-trips_.$tripId.tsx", "/operations/field-trips_/$tripId", "listFieldTripOperations", 'mode="detail"'],
  ["operations.field-trips_.new.tsx", "/operations/field-trips_/new", "listFieldTripOperations", 'mode="create"'],
  ["operations.interest-events_.$eventId.tsx", "/operations/interest-events_/$eventId", "listSchoolInterestEvents", 'mode="detail"'],
  ["operations.interest-events_.new.tsx", "/operations/interest-events_/new", "listSchoolInterestEvents", 'mode="create"'],
] as const;

describe("split-route source ownership and canonical handoffs", () => {
  it.each(splitPages)("%s is a registered dedicated page delegating to %s", (file, declaredRoute, owner, marker) => {
    const component = source("src/routes/" + file);
    expect(component).toContain('createFileRoute("' + declaredRoute + '")');
    expect(component).toContain("component:");
    expect(component).toContain(owner);
    expect(component).toContain(marker);
  });

  it("keeps all fourteen routes registered with their own fixture contracts", () => {
    const manifest = JSON.parse(source("scripts/seeds/fixture-manifest.json")) as {
      routes: Record<string, { seeds?: string[]; persona?: string }>;
    };
    expect(splitPages).toHaveLength(14);
    for (const [, route] of splitPages) {
      const publicRoute = route.replaceAll("_/", "/");
      expect(manifest.routes[publicRoute], publicRoute).toBeDefined();
      expect(manifest.routes[publicRoute].persona, publicRoute).toBeTruthy();
      expect(manifest.routes[publicRoute].seeds?.length, publicRoute).toBeGreaterThan(0);
    }
  });

  it("reuses the server's relationship- and capability-scoped read/write authorities", () => {
    const checks: Array<[string, string]> = [
      ["src/modules/identity/admin.functions.ts", 'requireActor(["registrar"], "admin.manage")'],
      ["src/modules/enrollment/admissions-intake.functions.ts", 'assertCapability(actor,"enrollment.decide")'],
      ["src/modules/learning/curriculum-marketplace.functions.ts", 'requireActor(["registrar"])'],
      ["src/modules/learning/curriculum-authoring.functions.ts", 'requireActor(["registrar"], "curriculum.publish")'],
      ["src/modules/communication/school-family-alerts.functions.ts", 'assertCapability(actor,"communication.send")'],
      ["src/modules/field-trips/field-trip-operations.functions.ts", 'requireActor(["registrar"], "enrollment:manage")'],
      ["src/modules/enrollment/interest-events.server.ts", "assertInterestEventManager(context);"],
    ];
    for (const [file, marker] of checks) {
      expect(source(file), file).toContain(marker);
    }
  });
});
