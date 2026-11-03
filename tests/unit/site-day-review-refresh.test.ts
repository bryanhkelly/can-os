import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("site day review remains connected to physical school-day evidence",()=>{
 it("refreshes persisted review when staff duty, human arrival and room evidence change",()=>{
  const route=readFileSync("src/routes/site.day.tsx","utf8");
  const site=readFileSync("src/components/operations/SiteDayPage.tsx","utf8");
  const staff=readFileSync("src/components/operations/OnsiteSupervisionPanel.tsx","utf8");
  const review=readFileSync("src/components/operations/OnsiteDayReconciliationPanel.tsx","utf8");
  expect(route).toContain("SiteDayPage");
  expect(site).toContain("refreshRevision={schoolDayRevision}");
  expect(site).toContain("onChanged={() => setSchoolDayRevision(revision => revision + 1)}");
  expect(review).toContain("[date,roster,refreshRevision,reload]");
  const duty=staff.slice(staff.indexOf("async function answerDuty("),staff.indexOf("async function recordPresence("));
  const presence=staff.slice(staff.indexOf("async function recordPresence("),staff.indexOf("return <section",staff.indexOf("async function recordPresence(")));
  expect(duty).toContain("mutation.run(()=>respondToOnsiteDuty(");
  expect(presence).toContain('if(action==="report")return reportOnsitePhysicalPresence(');
  expect(presence).toContain("return witnessOnsiteBlockPresence(");
  for(const command of [duty,presence])
    expect(command).toContain("refresh:async()=>{await refresh();await onChanged?.();}");
 });
});
