import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";

type IndexEntry={id:string;type:string;title:string;name?:string;exportName?:string};
const index=JSON.parse(readFileSync("storybook-static/index.json","utf8")) as {entries:Record<string,IndexEntry>};
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
   if(url.origin==="http://127.0.0.1:6007"&&!/^\/(?:api|_server|_serverFn|rpc|go)(?:\/|$)/i.test(url.pathname))return route.continue();
   if(url.protocol==="data:"||url.protocol==="blob:"||["fonts.googleapis.com","fonts.gstatic.com"].includes(url.hostname))return route.continue();
   unexpectedRequests.push(url.origin+url.pathname);return route.abort();
 });
 await page.goto("/iframe.html?id="+encodeURIComponent(id)+"&viewMode=story&globals=theme:"+encodeURIComponent(theme));
 await expect(page.locator('[data-storybook-theme="'+theme+'"]').first()).toBeVisible();
 await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
 return {unexpectedRequests,pageErrors};
}
async function assertCanvas(page:Page,failures:{unexpectedRequests:string[];pageErrors:string[]}){
 await expect(page.locator("#storybook-root")).toBeVisible();
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
