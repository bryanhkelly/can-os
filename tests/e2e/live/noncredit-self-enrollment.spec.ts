import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const base=process.env.CAN_RELEASE_E2E_URL ?? "";
const release=process.env.CAN_NONCREDIT_QA_RELEASE_ID ?? "";
const first=process.env.CAN_NONCREDIT_QA_CAN_SESSION_1 ?? "";
const second=process.env.CAN_NONCREDIT_QA_CAN_SESSION_2 ?? "";
const allowWrite=process.env.CAN_NONCREDIT_E2E_WRITES==="1";

async function open(page:Page,path:string){
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const response=await page.goto(path,{waitUntil:"domcontentloaded"});
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.getByRole("main")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
}

async function connectExistingVerifiedAccount(context:BrowserContext,cookie:string) {
  if(!cookie)throw new Error("Only a provisioned isolated QA verified CAN session is permitted");
  await context.addCookies([{
    name:"__Host-can_os_session",value:cookie,
    url:base,secure:true,httpOnly:true,sameSite:"Lax",
  }]);
}

test("@public noncredit enrollment is an actual route, not the lab placeholder",async({page})=>{
  await open(page,"/learn/enroll");
  await expect(page.getByRole("heading",{name:"Register for learning"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Choose a training"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm my registration"})).toHaveCount(0);
});

test("@public unverified visitor sees consent but cannot enroll",async({page})=>{
  test.skip(!release,"Requires a current approved test01 release UUID");
  await open(page,"/learn/enroll?release="+encodeURIComponent(release));
  await expect(page.getByRole("heading",{name:"Enrollment confirmation"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Sign in"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm my registration"})).toHaveCount(0);
});

test("@privacy unverified visitor cannot read My Courses or publisher controls",async({page})=>{
  await open(page,"/learn/my-courses");
  await expect(page.getByRole("main")).toContainText(/sign in|access/i);
  await open(page,"/programs/noncredit/enrollment");
  await expect(page.getByRole("button",{name:"Publish self-enrollment"})).toHaveCount(0);
});

test("@write only two verified adults can enroll, see own course, and withdraw",async({browser})=>{
  test.skip(!allowWrite||!first||!second||!release,
    "Requires explicit isolated QA write approval, two actual verified CAN sessions and an unused test-only release");
  const a=await browser.newContext({baseURL:base});
  const b=await browser.newContext({baseURL:base});
  try{
    await connectExistingVerifiedAccount(a,first);
    await connectExistingVerifiedAccount(b,second);
    const pa=await a.newPage();
    const pb=await b.newPage();
    const url="/learn/enroll?release="+encodeURIComponent(release);
    for(const page of [pa,pb]){
      await open(page,url);
      await expect(page.getByRole("heading",{name:"Enrollment confirmation"})).toBeVisible();
      await page.getByRole("checkbox",{name:/I have read and accept/i}).check();
      await page.getByRole("checkbox",{name:/I confirm I am 18 or older/i}).check();
      await page.getByRole("button",{name:"Confirm my registration"}).click();
      await expect(page.getByRole("status")).toContainText(/Registration confirmed|already registered/i);
      await open(page,"/learn/my-courses");
      await expect(page.getByRole("button",{name:"Open course"})).toBeVisible();
    }
    const aId=await pa.locator("article[data-course-attempt-id]").first()
      .getAttribute("data-course-attempt-id");
    const bId=await pb.locator("article[data-course-attempt-id]").first()
      .getAttribute("data-course-attempt-id");
    expect(aId).toBeTruthy();
    expect(bId).toBeTruthy();
    expect(aId).not.toBe(bId);
    await open(pa,"/learn/course/"+encodeURIComponent(bId!));
    await expect(pa.getByRole("main")).toContainText(/not authorized|missing required|unable|access/i);
    await open(pb,"/learn/my-courses");
    await pb.getByRole("button",{name:"Open course"}).click();
    await expect(pb).toHaveURL(/\/learn\/course\//);
    await open(pb,"/learn/my-courses");
    await pb.getByRole("button",{name:"Withdraw registration"}).click();
    await pb.getByRole("button",{name:"Confirm withdrawal"}).click();
    await expect(pb.getByRole("status")).toContainText(/Registration withdrawn|already withdrawn/i);
    await expect(pb.getByRole("button",{name:"Open course"})).toHaveCount(0);
  } finally {
    await Promise.all([a.close(),b.close()]);
  }
});
