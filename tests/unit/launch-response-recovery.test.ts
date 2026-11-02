import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("one-hour launch lost-response recovery",()=>{
  it("does not report a successful school creation as failed due to navigation",()=>{
    const source=readFileSync("src/components/operations/LaunchWizardPage.tsx","utf8").replace(/\r\n/g,"\n");
    const start=source.indexOf("async function submitLaunch(");
    const finish=source.indexOf("const {applySchoolModelPreset",start);
    const section=source.slice(start,finish);
    expect(section).toContain("setCreated({...result,programType:type})");
    expect(section).toContain("automatic navigation failed");
    expect(section.indexOf("setCreated({...result,programType:type})"))
      .toBeLessThan(section.indexOf("try {\n        await router.navigate("));
  });
  it("keeps a saved opening handoff and only navigates after activation",()=>{
    const source=readFileSync("src/components/operations/OneHourSchoolLaunch.tsx","utf8");
    const section=source.slice(source.indexOf("async function open("),source.indexOf("return <section className=",source.indexOf("async function open(")));
    expect(section.indexOf("await activateLaunch(")).toBeLessThan(section.indexOf("setOpened({"));
    expect(section.indexOf("setOpened({")).toBeLessThan(section.indexOf("await router.navigate("));
    expect(section).toContain("do not activate again");
  });
  it("holds invitation retries when the server result or refresh is uncertain",()=>{
    const source=readFileSync("src/components/operations/FamilyInviteImporter.tsx","utf8");
    const block=source.slice(source.indexOf("async function retryFailed("),source.indexOf("if (!workspace)",source.indexOf("async function retryFailed(")));
    expect(block.match(/setAwaitingVerification\(true\)/g)).toHaveLength(2);
    expect(source).toContain("disabled={busy || awaitingVerification} onClick={() => void retryFailed(batch.id)}");
    expect(source).toContain("Verify saved invitation batch");
  });
});
