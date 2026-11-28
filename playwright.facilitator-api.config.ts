import { defineConfig } from "@playwright/test";
import provision from "./playwright.pilot-provision.config";
if(!process.env.CAN_FACILITATOR_QA_JSON)throw Error("A reviewed isolated facilitator fixture is required");
export default defineConfig({...provision,testMatch:"facilitator-api.spec.ts",timeout:300000});
