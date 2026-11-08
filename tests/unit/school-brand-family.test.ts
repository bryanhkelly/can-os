import { describe, expect, it } from "vitest";
import { siteTemplateIds } from "@/domain/site-theme";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import { renderFamilyBrandPage, renderFamilyBrandEmail, familyBrandEmailSubject } from "@/domain/school-brand-family";
import { familySurveyFields, summarizeFamilySurvey } from "@/domain/family-recruitment-interest";

function context(templateId:typeof siteTemplateIds[number],siteName="Hillside Academy"){
 const content=createSchoolWebsiteStarterContent(siteName);
 return {siteName,branding:{...content.branding,templateId,
   paletteId:("brand-"+templateId) as typeof content.branding.paletteId}};
}
const params={
 preview:false,requestId:"11111111-1111-4111-8111-111111111111",
 batchId:"22222222-2222-4222-8222-222222222222",
 recipientKey:"33333333-3333-4333-8333-333333333333",
 firstName:"Pat",lastName:"Family",email:"pat@example.com",
 landingHref:"/family/interest?invitationBatchId=222",
 surveyHref:"/family/interest?invitationBatchId=222&view=survey",
};

describe("seven Site-specific family brand kits",()=>{
 it("renders seven distinct interest landing pages with the chosen real school name",()=>{
  const outputs=siteTemplateIds.map(templateId=>{
   const html=renderFamilyBrandPage(context(templateId),"landing",params);
   expect(html).toContain('data-design="'+templateId+'"');
   expect(html).toContain("Hillside Academy");
   expect(html).toContain('method="post" action="/family/interest"');
   expect(html).toContain('name="contactConsent"');
   expect(html).toContain("Not accepting applications");
   expect(html).toContain("three-minute family survey");
   expect(html).not.toContain("Heritage Academy</strong>");
   expect(html).not.toContain("<script");
   expect(html).not.toContain("@import");
   expect(html).not.toContain("images/");
   return html;
  });
  expect(new Set(outputs).size).toBe(7);
 });

 it("renders seven matched survey pages with adult-only input, bounded choices and no student names",()=>{
  for(const templateId of siteTemplateIds){
   const html=renderFamilyBrandPage(context(templateId),"survey",params);
   for(const name of ["grades","priority","learningPace","contactPreference","comments"])
     expect(html).toContain('name="'+name+'"');
   expect(html).toContain('value="none"');
   expect(html).toContain('name="contactConsent"');
   expect(html).not.toContain('name="studentName"');
   expect(html).toContain("Hillside Academy");
  }
 });

 it("generates 21 branded HTML emails with text fallbacks and fixed planning claims",()=>{
  const bodies=new Set<string>();
  for(const templateId of siteTemplateIds){
   for(const kind of ["confirmation","update","survey"] as const){
    const value=renderFamilyBrandEmail(context(templateId),kind,{
      firstName:"Pat",actionUrl:"https://example.edu/family/interest?invite=one",
    });
    expect(value.subject).toContain("Hillside Academy");
    expect(value.html).toContain("Hillside Academy");
    expect(value.html).toContain("Not accepting applications");
    expect(value.html).toContain("https://example.edu/family/interest?invite=one");
    expect(value.html).not.toContain("src=");
    expect(value.html).not.toContain("@import");
    expect(value.html).not.toContain("<script");
    expect(value.text).toContain("https://example.edu/family/interest?invite=one");
    bodies.add(value.html);
   }
  }
  expect(bodies.size).toBe(21);
  expect(familyBrandEmailSubject("confirmation","Hillside Academy"))
    .toBe("Thank you for your interest in Hillside Academy");
 });

 it("never sends from private previews and escapes school-controlled text",()=>{
  const preview=renderFamilyBrandPage(context("modern",'<script>alert("x")</script>'),
   "landing",{...params,preview:true});
  expect(preview).not.toContain("<script>");
  expect(preview).toContain("&lt;script&gt;");
  expect(preview).toContain("Forms do not submit or save data");
  expect(preview).toContain('button type="submit" disabled');
  const mail=renderFamilyBrandEmail({...context("heritage"),introduction:'Hello <script>evil()</script>'},
   "confirmation",{firstName:"<img>",preview:true,actionUrl:"javascript:alert(1)"});
  expect(mail.html).not.toContain("<script>");
  expect(mail.html).toContain("&lt;script&gt;");
  expect(mail.html).toContain("&lt;img&gt;");
  expect(mail.html).not.toContain('href="javascript:');
  expect(mail.html).toContain("No email has been sent");
 });

 it("records bounded survey answers without personal child data",()=>{
  const valid=familySurveyFields.parse({grades:"middle",priority:"community",
    learningPace:"curious",contactPreference:"none",comments:"Would like to know more"});
  expect(summarizeFamilySurvey(valid)).toContain("Follow-up: none");
  expect(summarizeFamilySurvey(valid).length).toBeLessThanOrEqual(500);
  expect(familySurveyFields.safeParse({...valid,childName:"Please do not store"}).success).toBe(false);
  expect(familySurveyFields.safeParse({...valid,priority:"unverified"}).success).toBe(false);
 });
});
