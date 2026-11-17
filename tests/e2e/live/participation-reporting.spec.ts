import {expect,test,type BrowserContext} from "@playwright/test";

/**
 * WS6 read-only authenticated acceptance. Opt in ONLY on an isolated QA
 * deployment whose canonical v3 Class migration and published test fixtures
 * have been approved. Never creates participants, reports or credentials.
 *
 * This file is intentionally outside the baseline authenticated smoke config.
 * WS00 owns its execution against the integrated exact-SHA build.
 */
const base=process.env.CAN_REPORT_QA_URL??"";
const classId=process.env.CAN_REPORT_QA_CLASS_ID??"";
const operator=process.env.CAN_REPORT_QA_OPERATOR_SESSION??"";
const foreign=process.env.CAN_REPORT_QA_FOREIGN_OPERATOR_SESSION??"";
const learner=process.env.CAN_REPORT_QA_LEARNER_SESSION??"";
const authorized=process.env.CAN_REPORT_E2E_READ_ONLY==="1"&&
  process.env.APP_ENV==="test"&&base.length>0&&classId.length>0;

async function login(context:BrowserContext,secret:string){
  if(!secret)throw new Error("A verified isolated QA canonical session is required");
  await context.addCookies([{
    name:"__Host-can_os_v3_session",value:secret,url:base,
    secure:true,httpOnly:true,sameSite:"Lax",
  }]);
}

test("anonymous users cannot export private Class reporting evidence",async({page})=>{
  test.skip(!authorized,"Requires explicit read-only isolated QA report fixture");
  const response=await page.goto(base+"/reports/classes/"+encodeURIComponent(classId),
    {waitUntil:"domcontentloaded"});
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByRole("button",{name:"Export evidence CSV"})).toBeDisabled();
  await expect(page.getByRole("main")).not.toContainText("Participant roster");
});

test("current exact-Site Class manager can view bounded metrics without learner records",async({
  page,context,
})=>{
  test.skip(!authorized||!operator,"Requires current provider Site Admin/Registrar QA session");
  await login(context,operator);
  const response=await page.goto(base+"/reports/classes/"+encodeURIComponent(classId));
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByRole("heading",{name:"Class reports"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Export evidence CSV"})).toBeEnabled();
  await expect(page.getByText("Metric definitions and audit trail")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Individual participant responses");
});

test("foreign-Site manager cannot read a different Class report",async({page,context})=>{
  test.skip(!authorized||!foreign,"Requires foreign operator fixture");
  await login(context,foreign);
  await page.goto(base+"/reports/classes/"+encodeURIComponent(classId));
  await expect(page.getByRole("button",{name:"Export evidence CSV"})).toBeDisabled();
  await expect(page.getByRole("main")).not.toContainText("Release-level evidence drill-down");
});

test("learner account cannot obtain provider-only Class reporting evidence",async({page,context})=>{
  test.skip(!authorized||!learner,"Requires learner fixture without Class reporting capabilities");
  await login(context,learner);
  await page.goto(base+"/reports/classes/"+encodeURIComponent(classId));
  await expect(page.getByRole("button",{name:"Export evidence CSV"})).toBeDisabled();
});

test("private operator report exposes only source-backed, scoped release evidence",async({page,context})=>{
  test.skip(!authorized||!operator,"Requires current authorized provider QA session");
  await login(context,operator);
  await page.goto(base+"/reports/");
  await expect(page.getByRole("heading",{name:"Program and Site reporting"})).toBeVisible();
  await expect(page.getByText(/One currently authorized operating Organization/)).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/unique people across releases.*verified/i);
});
