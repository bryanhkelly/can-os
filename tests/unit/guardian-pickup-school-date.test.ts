import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { siteDate } from "@/domain/expected-attendance";

describe("guardian pickup authorizations start on the school's calendar day",()=>{
  it("uses the campus zone, not the remote guardian's device timezone",()=>{
    const instant=new Date("2026-11-01T07:30:00.000Z");
    expect(siteDate(instant,"America/Los_Angeles")).toBe("2026-11-01");
    expect(siteDate(instant,"Pacific/Honolulu")).toBe("2026-10-31");
  });
  it("sources the form default from the verified student Program's Site timezone",()=>{
    const service=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
    const guardian=service.slice(service.indexOf("export const getGuardianPickupWorkspace"),service.indexOf("export const createPickupAuthorization"));
    const form=readFileSync("src/components/operations/GuardianPickupPanel.tsx","utf8");
    expect(guardian).toContain("siteTimezone: sites.timezone");
    expect(guardian).toContain(".innerJoin(sites, eq(sites.id, programs.siteId))");
    expect(guardian).toContain("schoolLocalToday: siteDate(new Date(), student.siteTimezone)");
    expect(form).toContain("startsOn: startDates[key] ?? student.schoolLocalToday");
    expect(form).not.toContain("todayForPickupInput()");
  });
});
