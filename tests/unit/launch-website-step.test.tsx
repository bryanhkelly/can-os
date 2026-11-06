import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({children, to}: {children: React.ReactNode; to: string}) => React.createElement("a", {href:to}, children),
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
    expect(html).toContain('href="/launch/school"');
    expect(html).toContain("Invite a website editor");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('sandbox=""');
    expect(html).not.toContain("Private draft</p>");
  });
});
