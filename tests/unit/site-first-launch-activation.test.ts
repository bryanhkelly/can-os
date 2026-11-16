import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(new URL(`../../${p}`,import.meta.url),"utf8");
describe("Site-first activation handoff",()=>{
  it("does not block preview or invent program absence on failed reads",()=>{
    const route=read("src/routes/launch.site.tsx");
    expect(route).toContain("supplementaryRead(");
    expect(route).toContain("programsState: recordRead.state");
    expect(route).toContain("record.siteId===deps.siteId");
    const panel=read("src/components/launch-studio/SiteLaunchActivationPanel.tsx");
    expect(panel).toContain("temporarily unavailable");
    expect(panel).toContain("site?.websiteDraft?.status");
    expect(panel).toContain("program.status");
  });
  it("keeps saved Site and native offering authorization separate",()=>{
    const panel=read("src/components/launch-studio/SiteLaunchActivationPanel.tsx");
    expect(panel).toContain('search={{siteId,programId:program.id}}');
    expect(panel).toContain('to="/settings/school/$module"');
    expect(panel).not.toContain('to="/launch/hub/school"');
    expect(panel).toContain('search={{publicSiteId:siteId}}');
    expect(panel).toContain('to="/canonical/blueprints"');
    expect(panel).not.toContain("launchReady");
  });
});
