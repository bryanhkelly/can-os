import { expect, test } from "@playwright/test";
import { renderPublicSiteHtml } from "../../../src/domain/public-site-html";
import type { PublicBlueprintProspectus } from "../../../src/domain/school-blueprint-approval";

const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const proposed:PublicBlueprintProspectus={
  version:1,
  heading:"Heritage Community Academy is taking shape",
  introduction:"We are preparing a community-centered middle school with academics and enrichment experiences.",
  notice:"Our school is still in development. Its proposed programs are not guarantees of enrollment or opening.",
  sourceBlueprintRevision:1,canApprovalVersion:1,
  items:[
    {sourceId:id(101),sourceKind:"program",title:"Grades 6–8 Academy",
     summary:"CAN-approved scope for planning.",state:"confirmed",canApprovalVersion:1},
    {sourceId:id(102),sourceKind:"item",title:"Robotics & Engineering",
     summary:"An approved robotics learning experience.",state:"confirmed",canApprovalVersion:1},
    {sourceId:id(103),sourceKind:"item",title:"Studio Art & Painting",
     summary:"Painting remains subject to facilities review.",state:"under_review",canApprovalVersion:null},
    {sourceId:id(104),sourceKind:"item",title:"Music & Performing Arts",
     summary:"We hope to introduce music in a later phase.",state:"future",canApprovalVersion:null},
  ],
};
test.describe("School Blueprint planning prospectus (read-only browser acceptance)",()=>{
  test.use({viewport:{width:390,height:844}});
  test("families see proposed versus approved status without an enrollment commitment",async({page})=>{
    const html=renderPublicSiteHtml({
      host:"heritage.can-os.com",
      site:{name:"Heritage Community Academy",organizationName:"Community nonprofit"},
      operatingStatus:"development",offerings:[],academicPrograms:[],prospectus:proposed,
    },{makeRequestId:()=>id(555)});
    await page.setContent(html,{waitUntil:"domcontentloaded"});
    await expect(page.getByText("Planning to open",{exact:false}).first()).toBeVisible();
    await expect(page.getByRole("heading",{name:"Studio Art & Painting"})).toBeVisible();
    await expect(page.getByText("Proposed · under review · not available for enrollment")).toBeVisible();
    await expect(page.getByRole("heading",{name:"Robotics & Engineering"})).toBeVisible();
    await expect(page.getByText("CAN-reviewed scope").first()).toBeVisible();
    await expect(page.getByText("Planned future experience · not available for enrollment")).toBeVisible();
    await expect(page.getByRole("button",{name:"Register interest"})).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).toHaveAttribute("required","");
    await expect(page.locator('input[name="email"]')).toHaveAttribute("type","email");
    await page.locator('select[name="interestSubject"]').selectOption("item:"+id(103));
    await expect(page.locator('input[name="contactConsent"]')).not.toBeChecked();
    await expect(page.locator('form[action="/inquiry"]')).toHaveCount(1);
    await expect(page.locator('form[action*="enroll"]')).toHaveCount(0);
    await expect(page.locator('form[action*="apply"]')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
  test("Valor's existing operational page has no planning prospectus",async({page})=>{
    const html=renderPublicSiteHtml({
      host:"valor.can-os.com",site:{name:"Valor School",organizationName:"CAN test school"},
      operatingStatus:"authorized",offerings:[],academicPrograms:[],
    });
    await page.setContent(html,{waitUntil:"domcontentloaded"});
    await expect(page.getByText("Valor School",{exact:false}).first()).toBeVisible();
    await expect(page.getByRole("heading",{name:"Studio Art & Painting"})).toHaveCount(0);
    await expect(page.locator('input[name="interestMode"][value="planning"]')).toHaveCount(0);
    await expect(page.locator('form[action*="enroll"]')).toHaveCount(0);
  });
});
