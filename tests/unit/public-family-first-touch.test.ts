import { describe,expect,it } from "vitest";
import { classifyPublicSiteRequest,slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { publicFamilyStartInput } from "@/domain/public-family-start";

const tenant="https://sample-school.can-os.com";
const program={
 programId:"4b5edc88-a161-497b-b761-e9f659a4f8f0",title:"School of Hope",
 summary:"Local learning led by CAN Academic Services in church classrooms.",
 typeLabel:"Church-hosted academy",grades:{min:"9",max:"12"},
 delivery:{onsite:true,asynchronous:true,liveOnline:false,onsiteDaysPerWeek:2},
 availability:"operating" as const, applicationOpen:true,
};

describe("published Site to verified first-family application boundary",()=>{
 it("offers first-family email verification for an operating published academic program",()=>{
   const html=renderPublicSiteHtml({
     host:"sample-school.can-os.com",site:{name:"School of Hope",organizationName:"Host Church"},
     academicPrograms:[program],offerings:[],
   },{makeRequestId:()=>"cb3edba8-28c8-4fda-ac27-23e680c55a7d"});
   expect(html).toContain('action="/apply"');
   expect(html).toContain("Verify email to apply");
   expect(html).toContain(`name="programId" value="${program.programId}"`);
   expect(html).not.toContain('name="studentFirstName"');
 });
 it("does not expose application form for an active program without separate admissions authority",()=>{
   const html=renderPublicSiteHtml({
     host:"sample-school.can-os.com",site:{name:"School of Hope",organizationName:"Host Church"},
     academicPrograms:[{...program,applicationOpen:false}],offerings:[],
   },{makeRequestId:()=>"cb3edba8-28c8-4fda-ac27-23e680c55a7d"});
   expect(html).not.toContain('action="/apply"');
   expect(html).toContain("applications not currently available");
 });
 it("never represents a planned program as open for new family applications",()=>{
   const html=renderPublicSiteHtml({
     host:"sample-school.can-os.com",site:{name:"School of Hope",organizationName:"Host Church"},
     academicPrograms:[{...program,availability:"planned",applicationOpen:false}],offerings:[],
   },{makeRequestId:()=>"cb3edba8-28c8-4fda-ac27-23e680c55a7d"});
   expect(html).not.toContain('action="/apply"');
 });
 it("permits only the dedicated write endpoint on tenant hosts",()=>{
   expect(classifyPublicSiteRequest(tenant+"/apply","POST",true)).toMatchObject({
     kind:"site",slug:"sample-school",rewrite:true,
   });
   expect(classifyPublicSiteRequest(tenant+"/published-site/family-start","POST",true)).toMatchObject({
     kind:"site",slug:"sample-school",rewrite:false,
   });
   for(const path of ["/family/join","/guardian/apply","/access/request","/api/jobs","/apply?other=1"])
     expect(classifyPublicSiteRequest(tenant+path,"POST",true).kind).toBe("deny");
   expect(classifyPublicSiteRequest(tenant+"/apply","POST",false).kind).toBe("deny");
   expect(slugForPublicSiteOrigin(new Request(tenant+"/published-site/family-start",{
     method:"POST",headers:{origin:tenant,host:"sample-school.can-os.com"},
   }),true)).toBe("sample-school");
 });
 it("validates minimal adult-only first-contact inputs",()=>{
   const data={requestId:"cb3edba8-28c8-4fda-ac27-23e680c55a7d",
     programId:program.programId,firstName:"Parent",lastName:"Applicant",
     email:" Parent@Example.org ",contactConsent:"yes",website:""};
   expect(publicFamilyStartInput.parse(data).email).toBe("parent@example.org");
   expect(()=>publicFamilyStartInput.parse({...data,childFirstName:"Not safe to collect"})).toThrow();
   expect(()=>publicFamilyStartInput.parse({...data,contactConsent:"no"})).toThrow();
 });
});
