import { test, expect } from "@playwright/test";

/**
 * Browser smoke covering public/manual join without synthetic credentials.
 * Full two-Site authenticated participation acceptance requires guarded
 * native QA principals and cannot be inferred from these smoke checks.
 */
test("manual classroom code entry validates before navigation",async({page})=>{
  await page.goto("/join");
  await expect(page.getByRole("heading",{name:"Join a classroom"})).toBeVisible();
  await page.getByRole("textbox",{name:"Pairing code"}).fill("ABC");
  await page.getByRole("button",{name:"Continue"}).click();
  await expect(page.getByRole("alert")).toContainText("10-character pairing code");
  await expect(page).toHaveURL(/\/join\/?$/);
});
test("well-formed manual code opens sign-in-gated participant selection",async({page})=>{
  await page.goto("/join");
  await page.getByRole("textbox",{name:"Pairing code"}).fill("ABCDE-FGHJK");
  await page.getByRole("button",{name:"Continue"}).click();
  await expect(page).toHaveURL(/\/join\/ABCDEFGHJK/);
  await expect(page.getByRole("heading",{name:"Join the facilitated classroom"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Pair to this course"})).toHaveCount(0);
});
