import {describe,it,expect} from "vitest";
import {projectSiteContentBriefV61} from "./site-content-brief-v61";
import {emptySiteStoryV61} from "./site-information-v61";
import {buildSiteGenerationInput,siteGenerationTaskSchema,parseGeneratedSiteContent} from "./site-content-generation";
import {initialOutreachPlanV61} from "./marketing-package-v61";
const siteId="123e4567-e89b-42d3-a456-426614174000";
const source={siteId,siteName:"Community Learning",siteRevision:"2026-11-21T18:00:00.000Z",
metadata:{siteHostingV61:{hostingMode:"same",separateHostName:"",separateHostType:"",nonprofitEin:"12-3456789",hostWebsiteUrl:"https://example.org"},siteStoryV61:{schemaVersion:1,revision:"2026-11-21T17:00:00.000Z",answers:{...emptySiteStoryV61(),foundingStory:"Private founding narrative"},changedByPersonId:siteId,updatedAt:"2026-11-21T17:00:00.000Z",status:"private_source"},launchPreferences:{delivery:"both",interestIds:["adult"],audienceIds:["adults"]}},
websiteContent:{contentReuseConsent:"granted" as const,heroHeadline:"Saved welcome",leadershipMembers:[{name:"Approved Leader",title:"Director",biography:"Approved biography",linkedinUrl:"https://www.linkedin.com/in/approved",consentConfirmed:true},{name:"Private Leader",title:"Advisor",biography:"Private biography",consentConfirmed:false}]}};
const brief=projectSiteContentBriefV61(source);
const task=siteGenerationTaskSchema.parse({target:"website",options:{}});
const output={schemaVersion:1,target:"website",website:{heroHeadline:"A place to learn",welcomeMessage:"Explore learning together.",localDescription:"Our community is planning new opportunities.",schoolVision:"We hope to help people grow.",communityOutreach:"We invite our neighbors to share ideas."},outreach:null,reviewNotes:[]};
describe("versioned Gloo content contract",()=>{
  it("excludes private, identifying and optional inputs by default",()=>{
    const payload=buildSiteGenerationInput(brief,task);
    const raw=JSON.stringify(payload);
    for(const value of [siteId,"12-3456789","Private founding narrative","Approved biography","Private Leader","Saved welcome","https://example.org"])expect(raw).not.toContain(value);
    expect(payload.planning.classification).toBe("proposed_only");
  });
  it("includes explicitly selected consented context only",()=>{
    const payload=buildSiteGenerationInput(brief,siteGenerationTaskSchema.parse({target:"website",options:{includeStory:true,includeLeadership:true,includeExistingCopy:true,includePublicReferences:true}}));
    expect(payload.story?.foundingStory).toBe("Private founding narrative");
    expect(payload.leadership).toHaveLength(1);
    expect(payload.publicReferences?.hostWebsite).toBe("https://example.org");
    expect(JSON.stringify(payload)).not.toContain("Private Leader");
  });
  it("rejects denied consent and projects outreach as intent, not contacts",()=>{
    expect(()=>buildSiteGenerationInput({...brief,consent:{contentReuseAllowed:false}},task)).toThrow();
    const input=buildSiteGenerationInput(brief,siteGenerationTaskSchema.parse({target:"outreach",options:{},plan:initialOutreachPlanV61()}));
    expect(input.taskContext?.action).toBe("learn-more");
  });
  it("rejects wrong targets, extra keys, missing fields, external URLs and overlong copy",()=>{
    expect(parseGeneratedSiteContent(JSON.stringify(output),"website").website?.heroHeadline).toBe("A place to learn");
    expect(()=>parseGeneratedSiteContent(JSON.stringify(output),"outreach")).toThrow();
    expect(()=>parseGeneratedSiteContent(JSON.stringify({...output,extra:true}),"website")).toThrow();
    expect(()=>parseGeneratedSiteContent(JSON.stringify({...output,website:{...output.website,heroHeadline:"x".repeat(121)}}),"website")).toThrow();
    expect(()=>parseGeneratedSiteContent(JSON.stringify({...output,website:{...output.website,heroHeadline:"Go to https://evil.example"}}),"website")).toThrow();
  });
});
