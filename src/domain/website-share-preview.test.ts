import { describe, it, expect } from "vitest";
import { parseWebsiteShareRequest, websiteSharePageUrl, renderShareableWebsiteHtml } from "./website-share-preview";
describe("shareable website preview boundary",()=>{
  const token="a".repeat(64);
  it("accepts only bounded token and canonical paths",()=>{
    expect(parseWebsiteShareRequest("https://site.test"+websiteSharePageUrl(token,"/about"))).toEqual({token,page:"/about"});
    expect(parseWebsiteShareRequest("https://site.test/website-share?token=bad")).toBeNull();
    expect(parseWebsiteShareRequest("https://site.test/website-share?token="+token+"&siteId=x")).toBeNull();
  });
  it("marks proposed status, keeps canonical pages and disables outbound calls",()=>{
    const html='<html><head><title>Test</title></head><body>'+
      '<a href="/about">About</a><a href="https://example.com/register">Register</a><a href="#team">Team</a></body></html>';
    const shared=renderShareableWebsiteHtml(html,token,["/","/about"]);
    expect(shared).toContain("Not approved or open for enrollment");
    expect(shared).toContain(websiteSharePageUrl(token,"/about"));
    expect(shared).not.toContain("example.com/register");
    expect(shared).toContain('aria-disabled="true"');
    expect(shared).toContain('href="#team"');
  });
});
