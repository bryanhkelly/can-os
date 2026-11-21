import { describe, expect, it } from "vitest";
import { initialSiteBrandConfiguration, resolveSiteBrandVersion } from "../src/domain/site-brand";
import { initialMarketingContent } from "../src/domain/marketing-package-v61";
import { renderSiteMarketingArtifact } from "../src/domain/site-artifact-renderer";

const siteId="11111111-1111-4111-8111-111111111111";
const brand=resolveSiteBrandVersion({
  id:"22222222-2222-4222-8222-222222222222",siteId,revision:2,
  configuration:initialSiteBrandConfiguration("Riverbend Community"),
  fingerprint:"a".repeat(64),createdAt:"2026-11-19T00:00:00.000Z",
},new Map());
const content={...initialMarketingContent("Riverbend Community","site-announcement"),
  headline:"A new learning community shaped by belonging and service is taking shape.",
  message:"We are exploring community learning. ".repeat(55),
};

describe("Introduce format-specific graphic rendering",()=>{
  it("generates different output templates while retaining the same Site identity",()=>{
    const [flyer,handout,social]=(["flyer","handout","social"] as const)
      .map(format=>renderSiteMarketingArtifact({format,brand,content,websiteUrl:null}));
    for(const artifact of [flyer,handout,social]){
      expect(artifact.templateVersion).toBe(2);
      expect(artifact.mimeType).toBe("image/svg+xml");
      expect(artifact.body).toContain("Riverbend Community");
      expect(artifact.body).toContain("Not accepting enrollment");
      expect(artifact.body).not.toContain("<script");
    }
    expect(new Set([flyer.templateId,handout.templateId,social.templateId]).size).toBe(3);
    expect(flyer.body).not.toEqual(handout.body);
    expect(flyer.body).not.toEqual(social.body);
    expect(social.body).toContain('width="1080"');
    expect(flyer.body).toContain('width="816"');
    expect(social.plainText).toContain(content.message);
  });
  it("bounds headline/body lines and escapes authored HTML",()=>{
    const unsafe={...content,headline:"<script>alert('hello')</script>",message:"<> & ".repeat(500)};
    const actual=renderSiteMarketingArtifact({format:"social",brand,content:unsafe,websiteUrl:null});
    expect(actual.body).toContain("&lt;script&gt;");
    expect(actual.body).not.toContain("<script>");
    expect(actual.body).toContain("…");
    expect(actual.plainText).toContain(unsafe.message);
  });
  it("isolates per-format copy while keeping the same Site Brand",()=>{
    const authored={...content,materialOverrides:{
      email:{headline:"A partnership conversation",message:"For email partners only."},
      social:{headline:"Join the conversation",message:"For social only."},
    }};
    const email=renderSiteMarketingArtifact({format:"email",brand,content:authored,websiteUrl:null});
    const social=renderSiteMarketingArtifact({format:"social",brand,content:authored,websiteUrl:null});
    const flyer=renderSiteMarketingArtifact({format:"flyer",brand,content:authored,websiteUrl:null});
    expect(email.body).toContain("A partnership conversation");
    expect(email.body).toContain("For email partners only.");
    expect(email.body).not.toContain("For social only.");
    expect(social.plainText).toContain("For social only.");
    expect(social.plainText).not.toContain("For email partners only.");
    expect(flyer.body).not.toContain("For email partners only.");
  });
  it("does not invent a CTA URL for a not-yet-published Site",()=>{
    const output=renderSiteMarketingArtifact({format:"email",brand,content,websiteUrl:null});
    expect(output.body).not.toContain('href="http');
    expect(output.plainText).toContain("Not accepting enrollment");
  });
});
