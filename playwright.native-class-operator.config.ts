import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";

/** Real mutating Class creation acceptance. Isolated QA only, never production. */
const origin=process.env.CAN_CLASS_OPERATOR_QA_BASE_URL??"";
const url=origin?new URL(origin):null;
if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
   process.env.CAN_CLASS_OPERATOR_QA_RUN!=="1"||
   process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||
   !process.env.TEST_DATABASE_URL||
   process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL||
   !process.env.CAN_APPLICATION_DB_HOST||
   !process.env.CAN_E2E_TEST_BRANCH_ID||
   !process.env.CAN_CLASS_OPERATOR_QA_SITE_ID||
   !process.env.CAN_CLASS_OPERATOR_QA_SECRET||
   !url||url.protocol!=="http:"||
   !["localhost","127.0.0.1","[::1]"].includes(url.hostname))
  throw new Error("Class operator browser QA requires an explicitly isolated test Neon branch and localhost-only app");

execFileSync(process.execPath,["scripts/acceptance/check-native-class-operator-qa.mjs"],{
  stdio:"inherit",env:process.env,
});

export default defineConfig({
  testDir:"./tests/e2e/qa",
  testMatch:"native-class-operator.spec.ts",
  timeout:120_000,expect:{timeout:25_000},
  workers:1,retries:0,reporter:"list",
  use:{baseURL:origin,trace:"retain-on-failure",viewport:{width:1440,height:900}},
  webServer:{
    command:`npm run dev -- --host ${url.hostname} --port ${url.port||"3199"} --strictPort`,
    url:origin,reuseExistingServer:false,timeout:180_000,
    env:{...process.env,APP_ENV:"test",NODE_ENV:"test"},
  },
});
