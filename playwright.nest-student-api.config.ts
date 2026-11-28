import {defineConfig} from "@playwright/test";
import provision from "./playwright.pilot-provision.config";
const env=process.env;
const suites={
 relationships:{fixture:"CAN_NEST_RELATIONSHIPS_QA_JSON",files:["nest-reporting-relationships.spec.ts"]},
 identity:{fixture:"CAN_NEST_OWNER_QA_JSON",files:["nest-owner-control-http.spec.ts","nest-staff-admin-http.spec.ts","nest-institutional-identity-http.spec.ts"]},
 roles:{fixture:"CAN_NEST_ROLES_QA_JSON",files:["nest-role-workspaces.spec.ts"]},
 student:{fixture:"CAN_STUDENT_QA_JSON",files:["nest-student-http.spec.ts","nest-access-provisioning-http.spec.ts"]},
 reporting:{fixture:"CAN_NEST_REPORT_QA_JSON",files:["nest-pilot-report-readback.spec.ts"]},
 pilot1:{fixture:"CAN_NEST_PILOT1_QA_JSON",files:["nest-pilot1-learning.spec.ts"]},
 pilot2:{fixture:"CAN_NEST_PILOT2_QA_JSON",files:["nest-pilot2-session.spec.ts"]},
} as const;
const selected=env.CAN_NEST_QA_SUITE??"student";
if(!Object.hasOwn(suites,selected))throw Error("Unknown Nest QA suite");
const suite=suites[selected as keyof typeof suites];
if(!env[suite.fixture])throw Error("Reviewed isolated QA fixture required");
if(!provision.webServer||Array.isArray(provision.webServer))throw Error("Existing isolated QA server configuration required");
export default defineConfig({
  ...provision,reporter:[["list"],["./tests/e2e/helpers/nest-required-acceptance-reporter.ts"],...(selected==="pilot2"?[["./tests/e2e/helpers/nest-pilot2-receipt-reporter.ts"]]:[])] as import("@playwright/test").ReporterDescription[],use:{...provision.use,baseURL:"http://localhost:3001"},testMatch:[...suite.files],timeout:600000,projects:[{name:"http-only"}],
  webServer:[{
    command:"npm --prefix apps/api start",
    url:"http://127.0.0.1:3001/api/v1/health/live",reuseExistingServer:false,timeout:30000,
    env:{...env as Record<string,string>,NODE_ENV:"test",API_HOST:"127.0.0.1",API_PORT:"3001",
      API_CANONICAL_READS:"1",API_CANONICAL_WRITES:"1",API_DOCS:"0",DATABASE_URL:env.TEST_DATABASE_URL!,
      RESEND_API_KEY:"",GLOO_API_KEY:"",RESEND_WEBHOOK_SECRET:""},
  }],
});
