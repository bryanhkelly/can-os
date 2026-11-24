import {describe,it,expect} from "vitest";
import {projectSiteContentBriefV61} from "./site-content-brief-v61";
import {siteGenerationOptionsSchema} from "./site-content-generation";
import {buildSitePackageInput,parseSiteContentPackage,privatePackageSourcesMatch} from "./site-content-package";
const brief=projectSiteContentBriefV61({siteId:"123e4567-e89b-42d3-a456-426614174000",siteName:"Community Learning",siteRevision:"2026-11-21T18:00:00.000Z",metadata:{launchPreferences:{delivery:"both",interestIds:["adult"],audienceIds:["adults"]}},websiteContent:{contentReuseConsent:"granted"}});
const input=buildSitePackageInput(brief,siteGenerationOptionsSchema.parse({}));
const message={headline:"Explore learning",message:"We invite you to share ideas.",callToAction:"Learn more"};
const content={schemaVersion:2,identity:{tagline:"Learn together",shortDescription:"A learning community",longDescription:"We hope to create new learning opportunities."},purpose:{mission:null,vision:null,values:[]},story:null,community:null,audiences:[{id:"adults",description:"Learning opportunities for adults."}],programs:[{id:"adult",description:"We are exploring adult learning."}],experiences:[],leadership:[],website:{heroHeadline:"Learn together",welcomeMessage:"Welcome to our learning community.",localDescription:"We are exploring new opportunities.",schoolVision:"We hope to help people learn.",communityOutreach:"Share your ideas with us."},marketing:{"site-announcement":message,"program-interest":message,"interest-invitation":message,"event-invitation":message,talkingPoints:[]},partnerships:{positioning:null},reviewNotes:[]};
describe("persistent Site Intelligence package",()=>{
 it("produces one strict input and one shared output with both consumers",()=>{
   expect(input.planning.audiences[0]?.id).toBe("adults");
   expect(input).not.toHaveProperty("target");
   expect(JSON.stringify(input)).not.toContain(brief.site.id);
   const result=parseSiteContentPackage(JSON.stringify(content),input);
   expect(result.website.heroHeadline).toBe("Learn together");
   expect(result.marketing["site-announcement"]).toEqual(message);
 });
 it("rejects ungrounded topics, invented leadership, private story and invalid copy",()=>{
   expect(()=>parseSiteContentPackage(JSON.stringify({...content,audiences:[{id:"unknown",description:"Unknown"}]}),input)).toThrow();
   expect(()=>parseSiteContentPackage(JSON.stringify({...content,leadership:[{index:0,biography:"Invented"}]}),input)).toThrow();
   expect(()=>parseSiteContentPackage(JSON.stringify({...content,story:"Invented"}),input)).toThrow();
   expect(()=>parseSiteContentPackage(JSON.stringify({...content,website:{...content.website,heroHeadline:"https://example.com"}}),input)).toThrow();
 });
 it("compares private sources independent of JSONB key order",()=>{
   expect(privatePackageSourcesMatch(input,JSON.parse(JSON.stringify(input)))).toBe(true);
   expect(privatePackageSourcesMatch(input,{...input,leadership:[{name:"New",title:"Leader",biography:"Changed"}]})).toBe(false);
 });
});
