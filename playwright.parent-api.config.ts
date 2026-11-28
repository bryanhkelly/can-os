import {defineConfig} from "@playwright/test";
import provision from "./playwright.pilot-provision.config";

if(!process.env.CAN_PARENT_QA_JSON)throw Error("Reviewed parent QA fixture required");
export default defineConfig({...provision,testMatch:"parent-api.spec.ts",timeout:180000});
