import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  parsePublicAdmissionsInterest, parsePublicSiteInterest,
  publicSiteInterestInput, publicSiteInterestMessage,
} from "@/domain/public-admissions-interest";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";

const id="11111111-1111-4111-8111-111111111111";
const params=()=>new URLSearchParams({
  requestId:id,firstName:"Taylor",lastName:"Parent",
  email:"Taylor@example.com",message:"Please send updates.",
  interestKind:"interest_list",contactConsent:"yes",website:"",
});
const page={
  host:"newlearning.can-os.com",
  site:{name:"New Learning Community",organizationName:"Community Foundation"},
  offerings:[],
};

describe("Level 1 Site interest without an approved Program",()=>{
  it("validates adult-only Site interest and never creates a Program claim",()=>{
    const parsed=parsePublicSiteInterest(params());
    expect(parsed.email).toBe("taylor@example.com");
    expect(parsed.interestKind).toBe("interest_list");
    expect(publicSiteInterestMessage(parsed)).toContain("no admission or seat priority");
    expect(()=>parsePublicAdmissionsInterest(params())).toThrow();
    expect(publicSiteInterestInput.safeParse({
      ...parsed,contactConsent:"no",
    }).success).toBe(false);
    expect(publicSiteInterestInput.safeParse({
      ...parsed,interestKind:"seat_guarantee",
    }).success).toBe(false);
  });

  it("renders a usable Site-level contact form with no Program ID",()=>{
    expect(availablePublicSitePaths(page)).toContain("/contact");
    const html=renderPublicSiteHtml(page,{path:"/contact",makeRequestId:()=>id});
    expect(html).toContain('id="site-interest"');
    expect(html).toContain('action="/inquiry" method="post"');
    expect(html).toContain('name="interestKind"');
    expect(html).toContain('value="tuition_updates"');
    expect(html).toContain('name="contactConsent" value="yes" required');
    expect(html).not.toContain('name="programId"');
    expect(html).not.toContain("guaranteed enrollment");
    const home=renderPublicSiteHtml(page,{makeRequestId:()=>id});
    expect(home).toContain('id="site-interest"');
  });

  it("never enables anonymous submissions from a private local preview",()=>{
    const html=renderPublicSiteHtml(page,{
      path:"/contact",localPreview:true,privateDraftPages:true,
      makeRequestId:()=>id,
    });
    expect(html).not.toContain('action="/inquiry"');
    expect(html).toContain("preview is read-only");
  });

  it("uses the existing guarded endpoint, canonical ledger and registrar inbox",()=>{
    const inquiry=readFileSync("src/routes/published-site.inquiry.ts","utf8");
    const server=readFileSync("src/modules/enrollment/public-admissions-interest.server.ts","utf8");
    const reader=readFileSync("src/modules/enrollment/public-admissions-interest-http.server.ts","utf8");
    const migration=readFileSync("drizzle/0099_site_level_public_interest.sql","utf8");
    expect(inquiry).toContain('recordPublicSiteInterest(slug,inquiry.data)');
    expect(server).toContain('eq(sitePublications.status,"published")');
    expect(server).toContain('programId:null');
    expect(server).toContain('type:"public_admissions_interest_followup"');
    expect(reader).toContain('isNull(publicAdmissionsInterests.programId)');
    expect(migration).toContain("ALTER COLUMN program_id DROP NOT NULL");
    expect(migration).toContain("public_site_interest_program_scope_ck");
    const registrar=readFileSync("src/modules/enrollment/public-admissions-interest-http.server.ts","utf8");
    expect(registrar).toContain("assignPublicSiteInterestToProgram");
    expect(registrar).toContain("resolvePrivateFamilyStartDestination(tx,data.programId)");
    expect(registrar).toContain("isNull(publicAdmissionsInterests.programId)");

  });
});
