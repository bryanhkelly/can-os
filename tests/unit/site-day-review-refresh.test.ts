import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("site day review remains connected to physical school-day evidence",()=>{
 it("refreshes persisted review when staff duty, human arrival and room evidence change",()=>{
  const site=readFileSync("src/routes/site.day.tsx","utf8");
  const staff=readFileSync("src/components/operations/OnsiteSupervisionPanel.tsx","utf8");
  const review=readFileSync("src/components/operations/OnsiteDayReconciliationPanel.tsx","utf8");
  expect(site).toContain("refreshRevision={schoolDayRevision}");
  expect(site).toContain("onChanged={() => setSchoolDayRevision(revision => revision + 1)}");
  expect(review).toContain("[date,roster,refresh,refreshRevision]");
  const duty=staff.slice(staff.indexOf("async function answerDuty("),staff.indexOf("async function recordPresence("));
  const presence=staff.slice(staff.indexOf("async function recordPresence("),staff.indexOf("return <section",staff.indexOf("async function recordPresence(")));
  expect(duty.indexOf("await respondToOnsiteDuty(")).toBeLessThan(duty.indexOf("onChanged?.();"));
  expect(presence.indexOf("await reportOnsitePhysicalPresence(")).toBeLessThan(presence.indexOf("onChanged?.();"));
  expect(staff).toContain("setNonce(value=>value+1);onChanged?.();");
 });
});
