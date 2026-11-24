import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { requireLocalHttpUrl } from "./tests/e2e/config/guards";

// A fresh local runtime is deliberately started against the attested isolated
// database. A deployed preview or pre-existing dev process cannot be reused.
const baseURL="http://localhost:5183";
requireLocalHttpUrl(baseURL,"Noncredit full journey");
const env=process.env;
const branch=env.CAN_PILOT_QA_BRANCH_ID;
if(env.APP_ENV!=="test"||env.NODE_ENV!=="test"||
  env.CAN_TEST_DB_WRITES_ENABLED!=="true"||!env.TEST_DATABASE_URL||
  !env.CAN_APPLICATION_DB_HOST||!branch||branch==="br-restless-sea-ar9ooo55"||
  branch==="br-bitter-feather-ar0u63x7")throw new Error("Explicit dedicated nonproduction Pilot QA branch required; production and retired test01 are forbidden");
if(!env.CAN_PILOT_QA_FIXTURE_JSON||!env.CAN_PILOT_QA_LEARNER_SESSION||
  !env.CAN_PILOT_QA_OTHER_SESSION||!env.CAN_PILOT_QA_PROVIDER_SESSION||
  new Set([env.CAN_PILOT_QA_LEARNER_SESSION,env.CAN_PILOT_QA_OTHER_SESSION,env.CAN_PILOT_QA_PROVIDER_SESSION]).size!==3)
  throw new Error("A reviewed fixture and three distinct isolated verified sessions are required");
const git=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim();
if(git("status","--porcelain")||git("rev-parse","HEAD")!==env.CAN_RELEASE_SOURCE_SHA)
  throw new Error("Use a clean checkout pinned to CAN_RELEASE_SOURCE_SHA");
execFileSync(process.execPath,["scripts/acceptance/check-noncredit-full-journey-fixture.mjs"],{
  stdio:"inherit",env:{...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch},
});

export default defineConfig({
  testDir:"./tests/e2e/live",
  testMatch:"noncredit-full-journey.spec.ts",
  timeout:300000,expect:{timeout:20000},workers:1,retries:0,
  reporter:"list",
  use:{baseURL,trace:"off",screenshot:"off",video:"off"},
  projects:[{name:"desktop-chromium",use:{browserName:"chromium",viewport:{width:1440,height:900}}}],
  webServer:{
    command:"npm run dev -- --host localhost --port 5183 --strictPort",
    url:baseURL,reuseExistingServer:false,timeout:180000,
    env:{...env as Record<string,string>,DATABASE_URL:env.TEST_DATABASE_URL,APP_ENV:"test",NODE_ENV:"test",CAN_TEST_DB_WRITES_ENABLED:"true"},
  },
});
