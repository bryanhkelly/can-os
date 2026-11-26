import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";

type IndexEntry={id:string;type:string;title:string;name?:string;exportName?:string;importPath?:string};
const index=JSON.parse(readFileSync("storybook-static/index.json","utf8")) as {entries:Record<string,IndexEntry>};
const registry=JSON.parse(readFileSync("docs/design-coverage/v61-registry.json","utf8")) as {layoutReferences:Record<string,string>};
function registeredStoryId(reference:string){
 const [file,name]=reference.split("#");
 if(!file||!name)throw Error("Invalid layout reference: "+reference);
 const suffix=name.replace(/([a-z0-9])([A-Z])/g,"$1-$2").replace(/([A-Z])([A-Z][a-z])/g,"$1-$2").toLowerCase();
 const found=Object.values(index.entries).find(entry=>entry.type==="story"&&entry.importPath?.replace(/^\.\//,"")===file&&(entry.exportName===name||(!entry.exportName&&entry.id.endsWith("--"+suffix))));
 if(!found)throw Error("Registered layout not built: "+reference);
 return found.id;
}
function storyId(title:string,exportName:string){
 const found=Object.values(index.entries).find(entry=>entry.type==="story"&&entry.title===title&&
   (entry.exportName===exportName||entry.name===exportName.replace(/([a-z])([A-Z])/g,"$1 $2")));
 if(!found)throw Error("Required acceptance story missing: "+title+" / "+exportName);
 return found.id;
}
async function openStory(page:Page,id:string,theme:string){
 const unexpectedRequests:string[]=[];
 const pageErrors:string[]=[];
 page.on("pageerror",error=>pageErrors.push(error.message));
 // No application RPC, private data, remote images or provider calls.
 // Fonts are the existing explicit exception pending a local asset migration.
 await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin==="http://127.0.0.1:6007"&&["GET","HEAD"].includes(route.request().method())&&!/^\/(?:api|_server|_serverFn|rpc|go)(?:\/|$)/i.test(url.pathname))return route.continue();
   if(url.protocol==="data:"||url.protocol==="blob:"||(["GET","HEAD"].includes(route.request().method())&&["fonts.googleapis.com","fonts.gstatic.com"].includes(url.hostname)))return route.continue();
   unexpectedRequests.push(url.origin+url.pathname);return route.abort();
 });
 await page.goto("/iframe.html?id="+encodeURIComponent(id)+"&viewMode=story&globals=theme:"+encodeURIComponent(theme));
 await expect(page.locator('[data-storybook-theme="'+theme+'"]').first()).toBeVisible();
 await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
 return {unexpectedRequests,pageErrors};
}
async function assertCanvas(page:Page,failures:{unexpectedRequests:string[];pageErrors:string[]}){
 await expect(page.locator("#storybook-root")).toBeVisible();
 await expect(page.locator("#storybook-root > *").first()).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 expect(failures.unexpectedRequests).toEqual([]);
 expect(failures.pageErrors).toEqual([]);
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
