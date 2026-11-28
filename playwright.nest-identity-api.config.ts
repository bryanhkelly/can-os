import {defineConfig} from "@playwright/test";
import provision from "./playwright.pilot-provision.config";
const env=process.env;
if(!provision.webServer||Array.isArray(provision.webServer))throw Error("Existing isolated QA server configuration required");
export default defineConfig({
  ...provision,use:{...provision.use,baseURL:"http://localhost:3001"},testMatch:["nest-access-provisioning-http.spec.ts","nest-owner-control-http.spec.ts","nest-staff-admin-http.spec.ts"],projects:[{name:"http-only"}],
  webServer:[{
    command:"npm --prefix apps/api start",
    url:"http://127.0.0.1:3001/api/v1/health/live",reuseExistingServer:false,timeout:30000,
    env:{...env as Record<string,string>,NODE_ENV:"test",API_HOST:"127.0.0.1",API_PORT:"3001",
      API_CANONICAL_READS:"1",API_CANONICAL_WRITES:"1",API_DOCS:"0",DATABASE_URL:env.TEST_DATABASE_URL!,
      RESEND_API_KEY:"",GLOO_API_KEY:"",RESEND_WEBHOOK_SECRET:""},
  }],
});
