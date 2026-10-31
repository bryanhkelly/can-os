import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { TEST_ACCESS_TOKEN_PEPPER } from "./tests/e2e/env";

/**
 * Fail closed: this suite creates real database-backed student/teacher sessions
 * and submits/grades synthetic work. Never run against an application database.
 */
const database=process.env.DATABASE_URL;
const test=process.env.TEST_DATABASE_URL;
const origin="http://localhost:3188";
const host=(url:string)=>new URL(url).hostname.replace(/-pooler(?=\.)/,"").toLowerCase();
if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
 process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||!database||!test||database!==test||
 !process.env.CAN_APPLICATION_DB_HOST||host(test)===process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/,"").toLowerCase()||
 (process.env.PLAYWRIGHT_BASE_URL!==undefined&&process.env.PLAYWRIGHT_BASE_URL!==origin)||
 !TEST_ACCESS_TOKEN_PEPPER||TEST_ACCESS_TOKEN_PEPPER.length<32)
 throw new Error("Algebra I browser acceptance requires the isolated TEST_DATABASE_URL, distinct application DB host, APP_ENV=test, NODE_ENV=test and explicit write guard.");

// Curriculum fixtures also write real database records; verify Postgres's
// attested branch before the first browser or fixture launches.
execFileSync(process.execPath, ["scripts/verify-admissions-neon-branch.mjs"], {
 stdio:"inherit",env:{...process.env,
 CAN_ADMISSIONS_TEST_BRANCH_ID:process.env.CAN_CURRICULUM_TEST_BRANCH_ID},
});
export default defineConfig({
 testDir:"./tests/e2e",
 testMatch:"algebra1-classroom.spec.ts",
 timeout:180_000,
 expect:{timeout:20_000},
 workers:1,retries:0,fullyParallel:false,
 reporter:[["list"],["html",{open:"never"}]],
 use:{baseURL:origin,trace:"retain-on-failure"},
 webServer:{
  command:"npm run dev -- --host localhost --port 3188 --strictPort",
  url:origin,reuseExistingServer:false,timeout:180_000,
  env:{
   DATABASE_URL:test,CAN_ACCESS_TOKEN_PEPPER:TEST_ACCESS_TOKEN_PEPPER,
   APP_ENV:"test",NODE_ENV:"test",
   CAN_TEST_DB_WRITES_ENABLED:"true",CAN_DEMO_WRITES_ENABLED:"true",
   CAN_R2_LIVE_UPLOADS_ENABLED:"false",CAN_R2_DEMO_UPLOADS_ENABLED:"false",
  },
 },
});
