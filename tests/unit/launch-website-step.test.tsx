import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({children, to, params, search}: {children: React.ReactNode; to: string; params?: Record<string,string>; search?: Record<string,string | undefined>}) => {
    const path=to.replace(/\$([A-Za-z][A-Za-z0-9]*)/g, (match,key:string)=>params?.[key] ? encodeURIComponent(params[key]) : match);
    const query=new URLSearchParams();
    for(const [key,value] of Object.entries(search??{})) if(value!==undefined)query.set(key,value);
    return React.createElement("a",{href:path+(query.size?"?"+query.toString():"")},children);
  },
}));
vi.mock("@/modules/programs/launch-website.functions", () => ({getLaunchWebsitePreparation:vi.fn()}));
vi.mock("@/components/operations/LaunchWebsiteEditorHandoff", () => ({
  LaunchWebsiteEditorHandoff: () => React.createElement("a", {href:"/launch/website"}, "Edit church-owned website content"),
}));
import { LaunchWebsitePreview } from "../../src/components/operations/LaunchWebsiteStep";

describe("school website preparation handoff", () => {
  it("reports private publication status, verified editor destination and family continuation without a duplicate iframe", () => {
    const html = renderToStaticMarkup(<LaunchWebsitePreview data={{
      programId:"program", programName:"Hope School", siteId:"site",
      host:"hope-school.can-os.com", status:"draft", publicAvailability:"not_published",
      hostingConfigured:false, includesSuggestions:true,
      previewHtml:"<p>Private draft</p>",
    }}/>);
    expect(html).toContain("Hope School");
    expect(html).toContain("Not published");
    expect(html).toContain("Family invitations can continue");
    expect(html).toContain("Suggested wording remains private");
    expect(html).toContain('href="/launch/website"');
    expect(html).toContain('href="/launch/site?siteId=site&amp;programId=program&amp;module=create-outreach"');
    expect(html).not.toContain("module=recruit");
    expect(html).toContain("Invite a website editor");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('sandbox=""');
    expect(html).not.toContain("Private draft</p>");
  });
});
