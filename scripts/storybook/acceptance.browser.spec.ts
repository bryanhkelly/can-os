import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {findStoryEntry} from "./index-contract.mjs";

type IndexEntry={id:string;type:string;title:string;name?:string;exportName?:string;importPath?:string};
const index=JSON.parse(readFileSync("storybook-static/index.json","utf8")) as {entries:Record<string,IndexEntry>};
const registry=JSON.parse(readFileSync("docs/design-coverage/v61-registry.json","utf8")) as {layoutReferences:Record<string,string>};
function registeredStoryId(reference:string){
 const [file,name]=reference.split("#");
 if(!file||!name)throw Error("Invalid layout reference: "+reference);
 const found=findStoryEntry(Object.values(index.entries),{path:file,exportName:name}) as IndexEntry | undefined;
 if(!found)throw Error("Registered layout not built: "+reference);
 return found.id;
}
function storyId(title:string,exportName:string){
 const found=findStoryEntry(Object.values(index.entries),{title,exportName}) as IndexEntry | undefined;
 if(!found)throw Error("Required acceptance story missing: "+title+" / "+exportName);
 return found.id;
}
async function openStory(page:Page,id:string,theme:string){
 const unexpectedRequests:string[]=[];
 const pageErrors:string[]=[];
 const failedAssets:string[]=[];
 page.on("pageerror",error=>pageErrors.push(error.message));
 page.on("response",response=>{
  const url=new URL(response.url());
  if(url.origin==="http://127.0.0.1:6007"&&response.status()>=400)failedAssets.push(response.status()+" "+url.pathname);
 });
 // No application RPC, private data, remote images or provider calls.
 // Fonts are bundled locally; no third-party network access is expected.
 await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin==="http://127.0.0.1:6007"&&["GET","HEAD"].includes(route.request().method())&&!/^\/(?:api|_server|_serverFn|rpc|go)(?:\/|$)/i.test(url.pathname))return route.continue();
   if(url.protocol==="data:"||url.protocol==="blob:")return route.continue();
   unexpectedRequests.push(url.origin+url.pathname);return route.abort();
 });
 await page.goto("/iframe.html?id="+encodeURIComponent(id)+"&viewMode=story&globals=theme:"+encodeURIComponent(theme));
 await expect(page.locator('[data-storybook-theme="'+theme+'"]').first()).toBeVisible();
 await page.evaluate(async()=>{
  await Promise.all([document.fonts.load('400 16px "DM Sans"'),document.fonts.load('400 24px "Instrument Serif"'),document.fonts.load('400 16px "JetBrains Mono"')]);
  await document.fonts.ready;
  for(const family of ["DM Sans","Instrument Serif","JetBrains Mono"]){
   if(![...document.fonts].some(face=>face.family.replace(/["']/g,"")===family&&face.status==="loaded"))throw Error("Bundled font unavailable: "+family);
  }
 });
 return {unexpectedRequests,pageErrors,failedAssets};
}
async function assertCanvas(page:Page,failures:{unexpectedRequests:string[];pageErrors:string[];failedAssets:string[]}){
 await expect(page.locator("#storybook-root")).toBeVisible();
 await expect(page.locator("#storybook-root > *").first()).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 expect(failures.unexpectedRequests).toEqual([]);
 expect(failures.pageErrors).toEqual([]);
 expect(failures.failedAssets).toEqual([]);
 await expect(page.locator("body")).not.toHaveClass(/sb-show-(?:errordisplay|nopreview)/);
 // Preserve real browser renders for independent review, not just failure screenshots.
 // These images are synthetic Storybook evidence, not authenticated application acceptance.
 const path=test.info().outputPath("review-render.png");
 await page.screenshot({path,fullPage:true,animations:"disabled"});
 await test.info().attach("review-render",{path,contentType:"image/png"});
}
test("launch journey remains responsive and gated",async({page},info)=>{
 const theme=String(info.project.metadata.theme);
 const failures=await openStory(page,storyId("10 User journeys/Launch Studio pilot","ReadyForReview"),theme);
 await expect(page.getByRole("heading",{name:"Prepare a community learning pilot"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Open registration"})).toBeDisabled();
 await expect(page.getByText("Independent publication approval is required.")).toBeVisible();
 await page.getByRole("button",{name:"Share preview"}).click();
 const dialog=page.getByRole("dialog",{name:"Share website preview"});
 await expect(dialog).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"Share preview"})).toBeFocused();
 await assertCanvas(page,failures);
});
test("milestones retain visible confirmed and unavailable states",async({page},info)=>{
 const failures=await openStory(page,storyId("04 Application patterns/Outcome milestones","Mixed"),String(info.project.metadata.theme));
 await expect(page.getByText("1 of 5 milestones confirmed complete")).toBeVisible();
 await expect(page.getByText("Status unavailable")).toBeVisible();
 await assertCanvas(page,failures);
});
test("welcome guide is discoverable from the built documentation",async({page},info)=>{
 test.skip(info.project.name!=="desktop-dark","Catalog navigation is independent of story viewport.");
 await page.goto("/?path=/docs/00-start-here-welcome--docs");
 const canvas=page.frameLocator("#storybook-preview-iframe");
 await expect(canvas.getByRole("heading",{name:"Becomuna Design System V6.1"})).toBeVisible();
});

test("print review preserves exact report values and definitions",async({page},info)=>{
 const failures=await openStory(page,registeredStoryId("src/components/workspace/report-document.stories.tsx#PrintReview"),String(info.project.metadata.theme));
 await expect(page.getByRole("table",{name:"Monthly registrations exact values"})).toBeVisible();
 await expect(page.getByRole("table",{name:"Community learning impact review metric definitions"})).toBeVisible();
 await assertCanvas(page,failures);
});

// The full layout catalog runs at the smallest and a desktop viewport. This is
// intentionally separate from the broad six-case matrix of critical workflows.
for(const [layout,reference] of Object.entries(registry.layoutReferences)){
 test("registered layout: "+layout,async({page},info)=>{
  test.skip(!["compact-light","desktop-dark","firefox-desktop","webkit-phone"].includes(info.project.name),"Layout smoke checks use compact and desktop projects.");
  const failures=await openStory(page,registeredStoryId(reference),String(info.project.metadata.theme));
  await assertCanvas(page,failures);
 });
}

test("generation read recovery is distinct from failed processing",async({page},info)=>{
 test.skip(!["compact-light","desktop-dark"].includes(info.project.name),"Critical recovery is exercised in compact and desktop modes.");
 const failures=await openStory(page,registeredStoryId("src/components/launch-studio/SiteGenerationStatus.stories.tsx#ConfirmedButReadUnavailable"),String(info.project.metadata.theme));
 await expect(page.getByText("Last request: Completed with follow-up")).toBeVisible();
 await expect(page.getByText("The stored package could not be loaded.")).toBeVisible();
 await assertCanvas(page,failures);
});
test("mutation recovery never repeats a confirmed write",async({page},info)=>{
 test.skip(!["compact-light","desktop-dark"].includes(info.project.name),"Critical recovery is exercised in compact and desktop modes.");
 const failures=await openStory(page,registeredStoryId("src/components/workspace/mutation-feedback.stories.tsx#RetryReadWithoutDuplicateWrite"),String(info.project.metadata.theme));
 // The story play function uses the actual command/read adapter contract.
 await expect(page.getByText("Command attempts: 1")).toBeVisible();
 await expect(page.getByText("Read attempts: 2")).toBeVisible();
 await expect(page.getByText("Fixture saved successfully.")).toBeVisible();
 await assertCanvas(page,failures);
});

test("curated template media is available without a live provider",async({request},info)=>{
 test.skip(info.project.name!=="desktop-dark","Static asset availability does not depend on viewport.");
 const response=await request.get("/school-template-previews/v1/bright/hero.jpg");
 expect(response.ok()).toBeTruthy();
 expect(response.headers()["content-type"]).toContain("image/jpeg");
 expect((await response.body()).length).toBeGreaterThan(0);
});

// Actual CSS :hover must be exercised by a native browser pointer. Synthetic
// Storybook user events need not activate CSS media/pseudo-class behavior.
test("filled actions preserve semantic color pairs on native pointer hover",async({page},info)=>{
 const failures=await openStory(page,registeredStoryId("src/components/ui/button.stories.tsx#FilledHoverContrast"),String(info.project.metadata.theme));
 for(const name of ["Continue","Delete draft"]){
  const button=page.getByRole("button",{name,exact:true});
  await page.mouse.move(0,0);
  const before=await button.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color};});
  await button.hover();
  await expect.poll(()=>button.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,decoration:s.textDecorationLine};})).toEqual({...before,decoration:"underline"});
 }
 await assertCanvas(page,failures);
});

// Verify the actual lazy Recharts adapter in the compiled catalog, including
// geometry and exact-value access at ordinary and narrow container widths.
for(const variant of ["Comparison","Mobile"] as const){
 test("report chart renders positive geometry: "+variant,async({page},info)=>{
  const failures=await openStory(page,registeredStoryId("src/components/workspace/report-chart.stories.tsx#"+variant),String(info.project.metadata.theme));
  const chart=page.locator("[data-report-chart=comparison]");
  const table=chart.getByRole("table",{name:"Pilot participation exact values"});
  await expect(table).toBeVisible();
  await expect(table.getByRole("rowheader",{name:"Completed"})).toBeVisible();
  await expect(table.getByText("69",{exact:true})).toBeVisible();
  const svg=chart.locator("[data-report-chart-plot] .recharts-surface");
  await expect(svg).toBeVisible({timeout:15_000});
  await expect.poll(async()=>{const box=await svg.boundingBox();return Boolean(box&&box.width>0&&box.height>0);}).toBe(true);
  await expect(chart.getByText("Chart unavailable. Exact values are below.")).toHaveCount(0);
  await expect.poll(()=>chart.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await assertCanvas(page,failures);
 });
}


test("adoption dashboard exposes route review filters and exact counts",async({page},info)=>{
 const failures=await openStory(page,registeredStoryId("src/components/workspace/design-adoption.stories.tsx#RegistryOverview"),String(info.project.metadata.theme));
 await expect(page.getByRole("heading",{name:"Design system adoption"})).toBeVisible();
 await expect(page.getByRole("table",{name:"Layout coverage counts"})).toBeVisible();
 const queue=page.getByRole("region",{name:"Route review queue"});
 await queue.getByRole("combobox",{name:"Review filter"}).selectOption("all");
 await expect(queue.getByRole("status")).toContainText("Showing 1–");
 await expect(queue.getByRole("table",{name:"Route review records"})).toBeVisible();
 await assertCanvas(page,failures);
});


test("component impact dashboard identifies exact catalog source and dependent routes",async({page},info)=>{
 const failures=await openStory(page,registeredStoryId("src/components/workspace/design-impact.stories.tsx#Inventory"),String(info.project.metadata.theme));
 const commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const identity=page.getByRole("region",{name:"Source identity"});
 await expect(identity.getByText(commit,{exact:true})).toBeVisible();
 const inventory=page.getByRole("region",{name:"Component inventory"});
 await inventory.getByRole("textbox",{name:"Find component"}).fill("src/components/ui/button.tsx");
 await expect(inventory.getByRole("status")).toContainText("of 1 modules");
 const details=page.getByRole("region",{name:"Selected component impact"});
 await expect(details.getByRole("table",{name:"Affected source routes"})).toBeVisible();
 await expect(details.getByRole("rowheader").first()).toBeVisible();
 await assertCanvas(page,failures);
});
