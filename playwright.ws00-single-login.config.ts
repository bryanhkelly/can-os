import {defineConfig} from "@playwright/test";
import {execFileSync} from "node:child_process";

/** Mutating release-critical QA only. Never run against production. */
const baseURL=process.env.CAN_WS00_QA_BASE_URL??"";
const url=baseURL?new URL(baseURL):null;
if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
   process.env.CAN_WS00_QA_RUN!=="1"||
   process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||
   !process.env.TEST_DATABASE_URL||
   process.env.TEST_DATABASE_URL!==process.env.DATABASE_URL||
   !process.env.CAN_APPLICATION_DB_HOST||
   !url||url.protocol!=="http:"||
   !["localhost","127.0.0.1","[::1]"].includes(url.hostname))
  throw new Error("WS00 single-login test requires isolated QA Neon and localhost-only app");
if(!process.env.CAN_WS00_QA_FRESH_LEARNER_CAN_SECRET)
  throw new Error("A new verified CAN-only adult learner fixture is mandatory");
execFileSync(process.execPath,["scripts/acceptance/check-ws00-qa-readiness.mjs"],{
  stdio:"inherit",env:process.env,
});
export default defineConfig({
  testDir:"./tests/e2e/qa",
  testMatch:"ws00-single-login-class.spec.ts",
  timeout:120_000,expect:{timeout:25_000},
  workers:1,retries:0,reporter:"list",
  use:{baseURL,trace:"retain-on-failure",viewport:{width:1440,height:900}},
  webServer:{
    command:`npm run dev -- --host ${url.hostname} --port ${url.port||"3199"} --strictPort`,
    url:baseURL,reuseExistingServer:false,timeout:180_000,
    env:{
      ...process.env,
      APP_ENV:"test",NODE_ENV:"test",
    },
  },
});
