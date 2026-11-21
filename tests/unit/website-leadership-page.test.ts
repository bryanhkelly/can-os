import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  emptySiteLocalContent, normalizeSiteLocalContent, classifySiteLocalContent,
} from "@/domain/site-local-content";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { publicSitePagePaths } from "@/domain/public-site-paths";
const read=(file:string)=>readFileSync(file,"utf8");

describe("optional Site-owned Leadership page",()=>{
  const original={
    ...emptySiteLocalContent,
    leadershipMembers:[{
      id:"1ebd686c-cafd-405c-b851-f3096940baa1",
      name:"Barton Demo School Leader",title:"Executive Director",
      biography:"Building a learning community with families.",
      linkedinUrl:"https://www.linkedin.com/in/barton-leader",
      consentConfirmed:true,
    }],
  };
  it("persists consented editorial leadership through the existing content model",()=>{
    const content=normalizeSiteLocalContent(original);
    expect(content.leadershipMembers).toHaveLength(1);
    expect(classifySiteLocalContent(content).status).toBe("published");
    const page={host:"barton.can-os.com",site:{
      name:"Barton Demo School",organizationName:"Community Partner",
    },offerings:[],localContent:content};
    expect(availablePublicSitePaths(page)).toContain("/leadership");
    const html=renderPublicSiteHtml(page,{path:"/leadership"});
    expect(html).toContain("Barton Demo School Leader");
    expect(html).toContain("Executive Director");
    expect(html).toContain("https://www.linkedin.com/in/barton-leader");
    expect(html).toContain("rel=\"noopener noreferrer\"");
    expect(publicSitePagePaths).toContain("/leadership");
  });
  it("never publishes nonconsented biographies or names",()=>{
    const content=normalizeSiteLocalContent({...original,leadershipMembers:[
      {...original.leadershipMembers[0]!,name:"Unconsented Person",consentConfirmed:false},
    ]});
    const page={host:"barton.can-os.com",site:{name:"Barton",organizationName:"Partner"},
      offerings:[],localContent:content};
    expect(availablePublicSitePaths(page)).not.toContain("/leadership");
    const draft=renderPublicSiteHtml(page,{path:"/leadership",
      localPreview:true,privateDraftPages:true});
    expect(draft).not.toContain("Unconsented Person");
  });
  it("rejects hostile third-party URLs and malformed bios",()=>{
    expect(()=>normalizeSiteLocalContent({...original,leadershipMembers:[
      {...original.leadershipMembers[0]!,linkedinUrl:"https://evil.test/steal"},
    ]})).toThrow(/LinkedIn/);
    expect(()=>normalizeSiteLocalContent({...original,leadershipMembers:[
      {...original.leadershipMembers[0]!,biography:"<script>alert(1)</script>"},
    ]})).toThrow();
  });
  it("uses existing Website & Brand editor with no auto-scraping",()=>{
    const editor=read("src/components/launch-studio/WebsiteSiteContentStep.tsx");
    const controls=read("src/components/launch-studio/WebsiteLeadershipEditor.tsx");
    const validator=read("src/modules/sites/site-website-preview.functions.ts");
    expect(editor).toContain("<WebsiteLeadershipEditor");
    expect(validator).toContain("leadershipMembers:z.array");
    expect(controls).toContain("No automatic LinkedIn retrieval");
    expect(controls).toContain("consentConfirmed");
    expect(controls).not.toContain("fetch(");
  });
});
