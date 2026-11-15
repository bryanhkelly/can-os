import { defineConfig } from "@playwright/test";

/**
 * On-demand noncredit self-enrollment verification. The deployed application
 * MUST be the exact current main SHA and backed by disposable test01 data.
 * No anonymous production writes and no local unsandboxed database fallback.
 */
const baseURL=process.env.CAN_RELEASE_E2E_URL;
const sourceSha=process.env.CAN_RELEASE_SOURCE_SHA;
const deployedSha=process.env.CAN_RELEASE_DEPLOYED_SHA;
if(!baseURL)throw new Error("CAN_RELEASE_E2E_URL is required");
const url=new URL(baseURL);
if(url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname))
  throw new Error("Noncredit acceptance requires HTTPS or localhost");
if(!sourceSha || !deployedSha || !/^[a-f0-9]{40}$/i.test(sourceSha) ||
   sourceSha!==deployedSha)
  throw new Error("Noncredit acceptance requires a matching deployed main commit SHA");
if(process.env.CAN_NONCREDIT_E2E_WRITES==="1"){
  if(process.env.APP_ENV!=="test" || process.env.CAN_TEST_DB_WRITES_ENABLED!=="true")
    throw new Error("Mutation tests require explicit test-only database write approval");
  if(!["localhost","127.0.0.1"].includes(url.hostname) && !url.hostname.includes("--"))
    throw new Error("Mutating acceptance requires a non-production preview URL");
  if(!process.env.CAN_NONCREDIT_QA_RELEASE_ID ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.CAN_NONCREDIT_QA_RELEASE_ID))
    throw new Error("A published test-only release UUID is required for acceptance writes");
}
export default defineConfig({
  testDir:"./tests/e2e/live",
  testMatch:"noncredit-self-enrollment.spec.ts",
  timeout:60000,
  expect:{timeout:12000},
  workers:1,
  retries:0,
  reporter:"list",
  use:{baseURL,trace:"retain-on-failure",screenshot:"only-on-failure"},
  projects:[
    {name:"desktop-chromium",use:{browserName:"chromium",viewport:{width:1440,height:900}}},
    {name:"mobile-chromium",use:{browserName:"chromium",viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
});
