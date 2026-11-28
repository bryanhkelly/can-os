import {defineConfig} from "@playwright/test";
import provision from "./playwright.pilot-provision.config";

if(!process.env.CAN_TEACHER_QA_API_FIXTURE_JSON)
  throw Error("Reviewed isolated teacher API fixture required");
export default defineConfig({...provision,testMatch:"teacher-api-journey.spec.ts",timeout:300000});
