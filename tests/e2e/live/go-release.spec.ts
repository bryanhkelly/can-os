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
  // Traverse the actual same-code link graph. Never include the bearer code,
  // page HTML, or full URLs in assertions or output artifacts.
  const pending=["/"];
  const seen=new Set<string>();
  while(pending.length){
    const path=pending.shift()!;
    if(seen.has(path))continue;
    if(seen.size>=15)throw new Error("Preview page graph exceeds the supported page catalog");
    seen.add(path);
    const url="/go/"+code+(path==="/"?"":"?page="+encodeURIComponent(path));
    const response=await page.goto(url,{waitUntil:"domcontentloaded"}).catch(()=>null);
    if(response?.status()!==200||new URL(page.url()).pathname!=="/go/"+code)
      throw new Error("A preview page did not render anonymously");
    const headers=response.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["content-security-policy"]).toContain("form-action 'none'");
    expect(headers["x-robots-tag"]).toContain("noindex");
    await expect(page.getByRole("status").filter({hasText:"Website preview"})).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    const hrefs=await page.locator("a[href]").evaluateAll(links=>links.map(link=>link.getAttribute("href")??""));
    for(const href of hrefs){
      if(href.startsWith("#"))continue;
      if(!href.startsWith("/go/"+code+"?"))throw new Error("Preview exposes an external or operational link");
      const target=new URLSearchParams(href.split("?")[1]).get("page");
      if(!target)throw new Error("Preview navigation missing a page target");
      if(!seen.has(target)&&!pending.includes(target))pending.push(target);
    }
    // Loading all rendered images catches broken R2 media and CSP regressions.
    // The result is boolean only, never a logged photo URL.
    const images=page.locator("img");
    if(await images.count()){
      await images.evaluateAll(items=>items.forEach(item=>(item as HTMLImageElement).loading="eager"));
      await expect.poll(async()=>images.evaluateAll(items=>items.every(item=>{
        const img=item as HTMLImageElement;
        return img.complete&&img.naturalWidth>0;
      })),{message:"All visible snapshot images must load"}).toBe(true);
    }
  }
  expect(seen.size).toBeGreaterThan(1);
  const malformed=await page.request.get("/go/"+code+"?page=%2Fadmin",{maxRedirects:0}).catch(()=>null);
  if(malformed?.status()!==404)throw new Error("Unsupported preview page must fail closed");
});
