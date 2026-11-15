import { describe, expect, it } from "vitest";
import { renderSiteFirstPrivatePlan, siteFirstPreviewHeaders } from "@/domain/site-first-preview";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";

const site = {
  host:"learning.can-os.com",
  site:{name:"Example Learning Center",organizationName:"Example Community Organization"},
  offerings:[],
  localContent:{
    ...emptySiteLocalContent,
    heroHeadline:"A place to learn.",
    localDescription:"Learning plans are taking shape.",
  },
};

describe("Site-first private website preview",()=>{
  it("uses the real Site renderer and places proposed program cards only in private HTML",()=>{
    const canonical=renderPublicSiteHtml(site,{localPreview:true});
    const preview=renderSiteFirstPrivatePlan(canonical,{
      delivery:"both",interestIds:["afterschool","adult","grades-6-8"],
    });
    expect(preview).toContain("Example Learning Center");
    expect(preview).toContain("Afterschool");
    expect(preview).toContain("Adult Learning");
    expect(preview).toContain("Grades 6–8");
    expect(preview).toContain("PROPOSED · NOT ENROLLING");
    expect(preview).not.toContain("<form");
    expect(preview).not.toContain("Register now");
    // Site publication must use the original canonical renderer, not the
    // separate private-intent overlay.
    expect(canonical).not.toContain("PROPOSED · NOT ENROLLING");
  });

  it("does not invent an offering when no interests are saved",()=>{
    const base="<html><head></head><body><main></main></body></html>";
    const html=renderSiteFirstPrivatePlan(base,null);
    expect(html).toContain("Select program interests");
    expect(html).not.toContain("Enroll now");
  });

  it("renders no unescaped program markup from private planning inputs",()=>{
    const output=renderSiteFirstPrivatePlan("<html><head></head><body><main></main></body></html>",{
      delivery:"digital", interestIds:["summer"],
    });
    expect(output).toContain("Summer &amp; Breaks");
    expect(output).not.toContain("<script");
  });

  it("never indexes private pages or allows cross-origin framing and form submissions",()=>{
    expect(siteFirstPreviewHeaders["Cache-Control"]).toBe("private, no-store");
    expect(siteFirstPreviewHeaders["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(siteFirstPreviewHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("form-action 'none'");
  });
});
