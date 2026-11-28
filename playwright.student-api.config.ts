import {defineConfig} from "@playwright/test";
import provision from "./playwright.pilot-provision.config";
if(!process.env.CAN_STUDENT_QA_JSON)throw Error("Reviewed two-student QA fixture required");
export default defineConfig({...provision,testMatch:"student-api.spec.ts",timeout:240000});
