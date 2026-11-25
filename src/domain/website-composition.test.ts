import {describe,it,expect} from "vitest";
import {websiteCompositionSchema,orderEligibleWebsitePages,orderWebsiteHomeSections} from "./website-composition";
import {composePublicSiteHome,siteTemplateCatalog,type PublicSiteHomeSections} from "./public-site-templates";
const plan=websiteCompositionSchema.parse({schemaVersion:1,navigation:["/","/about","/admissions","/contact"],homeSections:["hero","story","contact"]});
describe("internal website composition",()=>{
 it("does not grant access to an unavailable page, and newly launched pages are retained",()=>{
   expect(orderEligibleWebsitePages(["/","/about","/courses","/contact"],plan)).toEqual(["/","/about","/contact","/courses"]);
 });
 it("rejects unknown routes, duplicates and unregistered components",()=>{
   expect(websiteCompositionSchema.safeParse({...plan,navigation:["/","/admin"]}).success).toBe(false);
   expect(websiteCompositionSchema.safeParse({...plan,homeSections:["hero","hero"]}).success).toBe(false);
   expect(websiteCompositionSchema.safeParse({...plan,homeSections:["hero","raw-html"]}).success).toBe(false);
 });
 it("keeps new operational blocks without regenerating the saved plan",()=>{
   expect(orderWebsiteHomeSections(["hero","academics","story","channelsLearning","contact"],plan)).toEqual(["hero","story","academics","channelsLearning","contact"]);
 });
 it("renders every registered slot once across all seven governed templates",()=>{
   const keys=["hero","vision","story","explore","academics","enrichment","channelsLearning","channelsCommunity","closing","channelsClosing","contact"] as const;
   const sections=Object.fromEntries(keys.map(key=>[key,"["+key+"]"])) as PublicSiteHomeSections;
   for(const template of siteTemplateCatalog){
     const html=composePublicSiteHome(template.id,sections,plan);
     for(const key of keys)expect(html.split("["+key+"]").length).toBe(2);
     expect(html.indexOf("[story]")).toBeLessThan(html.indexOf("[academics]"));
   }
 });
});
