import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
vi.mock("@tanstack/react-router",()=>({Link:({children,to}:any)=>React.createElement("a",{href:to},children)}));
vi.mock("@/modules/programs/launch-website.functions",()=>({getLaunchWebsitePreparation:vi.fn()}));
vi.mock("@/modules/identity/workspace-session.functions",()=>({getWorkspaceSession:vi.fn()}));
import {LaunchWebsitePreview} from "../../src/components/operations/LaunchWebsiteStep";
describe("private website preparation in Launch Mode",()=>{
 it("shows the safe preview, real hosting limitation and next family step",()=>{
  const html=renderToStaticMarkup(<LaunchWebsitePreview data={{programId:"program",programName:"Hope School",siteId:"site",host:"hope-school.can-os.com",status:"draft",hostingConfigured:false,includesSuggestions:true,previewHtml:"<p>Private draft</p>"}}/>);
  expect(html).toContain('sandbox=""');expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain("Public hosting disabled");expect(html).toContain("not saved editorial revisions");
  expect(html).toContain('href="#invite-families"');expect(html).toContain("Invite your church website editor");
 });
});
