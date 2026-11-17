import { expect, test } from "@playwright/test";
import { withAuthenticatedPage } from "../helpers/authenticated-persona";

/**
 * Mutating, QA-ONLY positive Class journey. Never fake a Class or write directly
 * to education_v30 tables: the authenticated server command must create it.
 * The test intentionally fails on missing publisher approval, Site rights,
 * adoption, unavailable native service, or failed persistence.
 */
const secret=process.env.CAN_CLASS_OPERATOR_QA_SECRET!;
const siteId=process.env.CAN_CLASS_OPERATOR_QA_SITE_ID!;
const baseURL=process.env.CAN_CLASS_OPERATOR_QA_BASE_URL!;

test("verified operator creates and reloads one real native Class through /class",async({browser})=>{
  await withAuthenticatedPage(browser,secret,async({page})=>{
    await page.goto("/class?view=manage&siteId="+encodeURIComponent(siteId));
    await expect(page.getByRole("heading",{name:"Class management"})).toBeVisible();
    const course=page.locator("#native-class-course");
    await expect(course).toBeVisible();
    // No fake server responses and no retry that creates direct database rows.
    await expect.poll(()=>course.locator("option").count()).toBeGreaterThan(1);
    const modes=page.locator("#native-class-mode");
    let eligible=false;
    const courseCount=await course.locator("option").count();
    for(let i=1;i<courseCount&&!eligible;i++){
      await course.selectOption({index:i});
      const availableModes=await modes.locator("option").evaluateAll(
        options=>options.map(option=>(option as HTMLOptionElement).value)
      );
      for(const mode of availableModes){
        await modes.selectOption(mode);
        const eligibleSite=page.locator("#native-class-site")
          .locator("option[value='"+siteId+"']");
        if(await eligibleSite.count()){
          await page.locator("#native-class-site").selectOption(siteId);
          eligible=true;
          break;
        }
      }
    }
    expect(eligible,
      "The signed-in operator needs an approved Course adoption and a real allowed delivery mode at this exact Site"
    ).toBe(true);

    const name=page.locator("#native-class-title");
    const title="QA Native Class "+Date.now();
    if(await name.isEnabled())await name.fill(title);
    const persistedTitle=await name.inputValue();
    const create=page.getByRole("button",{name:"Create draft Class"});
    await expect(create).toBeEnabled();
    await create.click();
    const open=page.getByRole("link",{name:"Open newly created Class"});
    await expect(open).toBeVisible({timeout:30000});
    const href=await open.getAttribute("href");
    const id=href?.match(/\/class\/([0-9a-f-]{36})/i)?.[1];
    expect(id,"Create command must return a persisted canonical Class ID").toBeTruthy();

    // Persistence check must go through a fresh server-backed read,
    // not the local create success state or a direct SQL insert.
    await page.reload();
    await expect(page.getByRole("heading",{name:"Class management"})).toBeVisible();
    await expect(page.locator('a[href*="'+id+'"]').first()).toBeVisible({timeout:30000});
    await page.goto("/class/"+id+"?view=manage&tab=overview");
    await expect(page.getByRole("heading",{name:persistedTitle,exact:true})).toBeVisible({timeout:30000});
    await expect(page.getByRole("heading",{name:"Class unavailable"})).toHaveCount(0);
  },baseURL);
});
