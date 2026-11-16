import { expect,test,type Browser,type Page } from "@playwright/test";
import { canonicalSessionCookie } from "../../../src/domain/canonical-access";

/** Exactly the synthetic QA personas prepared by WS00, not a live user login.
 * This suite is read-only: no enrollment, playback, pairing or attendance POST.
 * Real start/end, pairing and attendance still require separate disposable E2E.
 */
const baseURL=process.env.CAN_WS4_QA_BASE_URL!;
const siteA={
  classId:process.env.CAN_WS4_QA_CLASS_A!,
  facilitator:process.env.CAN_WS4_QA_FACILITATOR_A_SECRET!,
  learner:process.env.CAN_WS4_QA_LEARNER_A_SECRET!,
};
const siteB={
  classId:process.env.CAN_WS4_QA_CLASS_B!,
  facilitator:process.env.CAN_WS4_QA_FACILITATOR_B_SECRET!,
  learner:process.env.CAN_WS4_QA_LEARNER_B_SECRET!,
};

async function withNativePerson<T>(
  browser:Browser,secret:string,run:(page:Page)=>Promise<T>,
):Promise<T>{
  const context=await browser.newContext({baseURL});
  try{
    const page=await context.newPage();
    const local=new URL("/__ws4_synthetic_session__",baseURL).toString();
    // A localhost response, not a script-visible JS cookie, sets the same
    // HttpOnly Secure canonical cookie as the native learning login.
    await page.route(local,route=>route.fulfill({
      status:200,
      headers:{
        "Content-Type":"text/plain",
        "Set-Cookie":canonicalSessionCookie+"="+secret+
          "; Path=/; Secure; HttpOnly; SameSite=Lax",
      },body:"Synthetic WS4 QA session",
    }));
    await page.goto(local);
    await page.unroute(local);
    return await run(page);
  }finally{await context.close();}
}

test("four dated Sessions remain Site-scoped for independent facilitators",async({browser})=>{
  for(const [owner,other] of [[siteA,siteB],[siteB,siteA]] as const){
    await withNativePerson(browser,owner.facilitator,async page=>{
      await page.goto("/classes/"+owner.classId+"?view=teach&tab=sessions");
      await expect(page.getByRole("heading",{name:"Class Sessions"})).toBeVisible();
      for(let i=1;i<=4;i++)
        await expect(page.getByText("Session "+i,{exact:true})).toBeVisible();
      await expect(page.getByText("Session 5",{exact:true})).toHaveCount(0);
      await page.goto("/classes/"+other.classId+"?view=teach&tab=sessions");
      await expect(page.getByRole("heading",{name:"Class unavailable"})).toBeVisible();
      await expect(page.getByRole("heading",{name:"Class Sessions"})).toHaveCount(0);
    });
  }
});

test("Class learners see four own Sessions and cannot see the other Site",async({browser})=>{
  for(const [owner,other] of [[siteA,siteB],[siteB,siteA]] as const){
    await withNativePerson(browser,owner.learner,async page=>{
      await page.goto("/classes/"+owner.classId+"?view=learn&tab=sessions");
      await expect(page.getByRole("heading",{name:"Class Sessions"})).toBeVisible();
      for(let i=1;i<=4;i++)
        await expect(page.getByText("Session "+i,{exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"Emergency revoke room"})).toHaveCount(0);
      await expect(page.getByRole("button",{name:"Cancel or reschedule Session"})).toHaveCount(0);
      await page.goto("/classes/"+other.classId+"?view=learn&tab=sessions");
      await expect(page.getByRole("heading",{name:"Class unavailable"})).toBeVisible();
    });
  }
});

test("no canonical Session grants Class read or facilitator controls",async({page})=>{
  await page.goto("/classes/"+siteA.classId+"?view=teach&tab=sessions");
  await expect(page.getByRole("heading",{name:"Class unavailable"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Open room"})).toHaveCount(0);
});
