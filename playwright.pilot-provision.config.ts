import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { requireLocalHttpUrl } from "./tests/e2e/config/guards";

const env=process.env;
const baseURL="http://localhost:5183";
requireLocalHttpUrl(baseURL,"Pilot provisioning");
if(env.APP_ENV!=="test"||env.NODE_ENV!=="test"||
  env.CAN_TEST_DB_WRITES_ENABLED!=="true"||
  env.CAN_PILOT_QA_BRANCH_ID!=="br-solitary-art-arun91gj"||
  !env.TEST_DATABASE_URL||!env.CAN_CANONICAL_AUTH_DATABASE_URL||
  !env.CAN_ACCESS_MAIL_OUTBOX_DIR||env.CAN_ACCESS_PUBLIC_ORIGIN!=="https://app.can-os.test"||
  env.CAN_DEMO_FIXED_ACCESS_ENABLED!=="false"||env.RESEND_API_KEY||env.GLOO_API_KEY)
  throw Error("Use the isolated qa:pilot provision runner");
const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
if(git("status","--porcelain")||git("rev-parse","HEAD")!==env.CAN_RELEASE_SOURCE_SHA)
  throw Error("Use a clean exact-revision QA checkout");
export default defineConfig({
  testDir:"./tests/e2e/live",testMatch:"pilot-provisioning-api.spec.ts",
  timeout:240000,workers:1,retries:0,reporter:"list",
  use:{baseURL,trace:"off",screenshot:"off",video:"off"},
  projects:[{name:"chromium",use:{browserName:"chromium"}}],
  webServer:{command:"npm run dev -- --host localhost --port 5183 --strictPort",
    url:baseURL,reuseExistingServer:false,timeout:180000,
    env:{...env as Record<string,string>,DATABASE_URL:env.TEST_DATABASE_URL,
      RESEND_API_KEY:"",RESEND_WEBHOOK_SECRET:"",GLOO_API_KEY:"",CAN_CAMPAIGN_FROM_EMAIL:""}},
});
