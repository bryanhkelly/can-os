import {defineConfig} from "@playwright/test";
import {execFileSync} from "node:child_process";
import provision from "./playwright.pilot-provision.config";

if(!process.env.CAN_PILOT_QA_FIXTURE_JSON||!process.env.CAN_PILOT_QA_API_ACTORS_JSON)
  throw Error("Reviewed fixture and three ordinary email-link actor selections required");
execFileSync(process.execPath,["scripts/acceptance/check-noncredit-full-journey-fixture.mjs"],{
  stdio:"inherit",env:{...process.env,CAN_PILOT_QA_STANDARD_ACCESS:"true"},
});
export default defineConfig({...provision,testMatch:"noncredit-api-journey.spec.ts",timeout:300000,expect:{timeout:20000}});
