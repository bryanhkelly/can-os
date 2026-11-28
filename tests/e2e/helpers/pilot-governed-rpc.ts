import {type BrowserContext,type Page} from "@playwright/test";
const origin="http://localhost:5183";
const modules={
  release:"/src/modules/learning/native-offering-release.functions.ts",
  registration:"/src/modules/enrollment/noncredit-self-enrollment.functions.ts",
  enrollment:"/src/modules/classes/native-class-enrollment.functions.ts",
  session:"/src/modules/classes/native-class-sessions.functions.ts",
  agenda:"/src/modules/classes/native-class-session-agenda.functions.ts",
  room:"/src/modules/learning/facilitated-learning.functions.ts",
  attendance:"/src/modules/learning/classroom-attendance.functions.ts",
  relationships:"/src/modules/reporting/bottom-up-reporting-relationships.functions.ts",
  report:"/src/modules/reporting/native-class-report.functions.ts",
} as const;
export async function pilotRpcPage(context:BrowserContext):Promise<Page>{
  const page=await context.newPage();
  await page.route(origin+"/__pilot_api_test_context",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>Isolated QA API</title>"}));
  await page.goto(origin+"/__pilot_api_test_context");
  return page;
}
export async function pilotRpc<T=unknown>(page:Page,module:keyof typeof modules,command:string,data?:unknown):Promise<T>{
  return page.evaluate(async({url,command,data})=>{
    const api=await import(/* @vite-ignore */ url);
    const fn=api[command];
    if(typeof fn!=="function")throw Error("Missing production server function");
    return await fn({data});
  },{url:modules[module],command,data}) as Promise<T>;
}
