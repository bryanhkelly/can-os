import { describe, expect, it } from "vitest";
import { noncreditEnrollmentOrigin, renderSiteNoncreditOfferings } from "@/domain/site-noncredit-public";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

const approved={
  releaseId:"f1000000-0000-4000-8000-000000000001",
  title:"Digital Skills & AI",
  siteName:"Example Learning Center",
  seatsRemaining:12,
  waitlistAvailable:false,
};

describe("approved Site noncredit enrollment cards",()=>{
  it("only accepts a configured HTTPS application origin",()=>{
    expect(noncreditEnrollmentOrigin("https://app.can-os.com/")).toBe("https://app.can-os.com");
    for(const value of [
      "", "http://app.can-os.com", "https://app.can-os.com/path",
      "https://app.can-os.com?x=1", "https://a.example@evil.com",
      "javascript:alert(1)",
    ]) expect(noncreditEnrollmentOrigin(value)).toBeNull();
  });

  it("creates a real enrollment link from a separately approved release",()=>{
    const html=renderSiteNoncreditOfferings([approved],"https://app.can-os.com");
    expect(html).toContain("/learn/enroll?release="+approved.releaseId);
    expect(html).toContain("Register for this course");
    expect(html).toContain("Digital Skills &amp; AI");
    expect(html).not.toContain("applicationOpen");
  });

  it("honors waitlist and missing origin without a false registration CTA",()=>{
    const wait={...approved,seatsRemaining:0,waitlistAvailable:true};
    expect(renderSiteNoncreditOfferings([wait],"https://app.can-os.com")).toContain("Join the waitlist");
    const noOrigin=renderSiteNoncreditOfferings([wait],null);
    expect(noOrigin).not.toContain("<a ");
    expect(noOrigin).not.toContain("href=");
    expect(renderSiteNoncreditOfferings([],null)).toBe("");
  });

  it("escapes titles and rejects invalid release IDs",()=>{
    const unsafe={...approved,title:"<script>alert(1)</script>"};
    const html=renderSiteNoncreditOfferings([unsafe],"https://app.can-os.com");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(renderSiteNoncreditOfferings([{...approved,releaseId:"/outside"}],"https://app.can-os.com")).toBe("");
  });

  it("keeps approved releases independent from Site interest chips",()=>{
    const page={
      host:"example.can-os.com",
      site:{name:"Example Learning Center",organizationName:"Example Organization"},
      offerings:[],
      localContent:emptySiteLocalContent,
      noncreditReleases:[approved],
      enrollmentAppOrigin:"https://app.can-os.com",
    };
    const live=renderPublicSiteHtml(page);
    const without=renderPublicSiteHtml({...page,noncreditReleases:[]});
    expect(live).toContain("Register for this course");
    expect(without).not.toContain("Register for this course");
    expect(renderPublicSiteHtml(page,{path:"/"})).toContain(approved.releaseId);
  });
});
