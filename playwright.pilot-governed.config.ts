import { defineConfig } from "@playwright/test";
import provision from "./playwright.pilot-provision.config";
if(!process.env.CAN_PILOT_QA_GOVERNED_JSON)throw Error("A reviewed branch-scoped governed scenario is required");
export default defineConfig({...provision,testMatch:"pilot-governed-api.spec.ts",timeout:300000});
