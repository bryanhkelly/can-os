import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

// The optional preview code is a revocable, unlisted invitation. Never store
// its URL or snapshot in a Playwright trace, screenshot, or video artifact.
test.use({trace:"off",screenshot:"off",video:"off"});
test("@public unknown Go code fails closed without a sign-in redirect",async({request})=>{
  const r=await request.get("/go/"+randomBytes(9).toString("base64url"),{maxRedirects:0});
  expect(r.status()).toBe(404);
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect(r.headers()["x-robots-tag"]).toContain("noindex");
  expect(await r.text()).toContain("This link is no longer available");
});
test("@public external website preview works without an account",async({page})=>{
  const code=process.env.CAN_LIVE_PREVIEW_CODE;
  test.skip(!code,"Supply a dedicated, revocable test preview code to verify real R2-backed rendering");
  if(!code||!/^[A-Za-z0-9_-]{12}$/.test(code))throw new Error("Invalid configured preview code");
  const response=await page.goto("/go/"+code,{waitUntil:"domcontentloaded"});
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/go/"+code);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["content-security-policy"]).toContain("form-action 'none'");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("status").filter({hasText:"Website preview"})).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  const links=page.locator('a[href^="/go/"]');
  if(await links.count()){
    const next=await links.first().getAttribute("href");
    expect(next?.startsWith("/go/"+code+"?")).toBe(true);
    const nextResponse=await page.goto(next!);
    expect(nextResponse?.status()).toBe(200);
    await expect(page.getByRole("status").filter({hasText:"Website preview"})).toBeVisible();
  }
});
