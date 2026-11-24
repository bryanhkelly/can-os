import {describe,it,expect} from "vitest";
import {parseSiteContentPackage,privatePackageSourcesMatch} from "./site-content-package";
import {brief,input,message,content} from "../../tests/fixtures/site-content-package.fixture";
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
