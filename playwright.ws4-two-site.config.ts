import { defineConfig } from "@playwright/test";

/** Separate, explicitly opt-in, read-only authenticated two-Site QA.
 * Never points at production and never creates Class/Session/enrollment rows.
 * Synthetic identities and four Session fixtures must be created by WS00.
 */
const baseURL=process.env.CAN_WS4_QA_BASE_URL;
if(process.env.CAN_WS4_QA_RUN!=="1"||!baseURL)
  throw new Error("WS4 QA requires CAN_WS4_QA_RUN=1 and local CAN_WS4_QA_BASE_URL");
const url=new URL(baseURL);
if(url.protocol!=="http:"||!["localhost","127.0.0.1","[::1]"].includes(url.hostname))
  throw new Error("WS4 QA must target a locally hosted, isolated test environment");
const ids=[process.env.CAN_WS4_QA_CLASS_A,process.env.CAN_WS4_QA_CLASS_B];
if(ids.some(id=>!id||!/^[a-f0-9-]{36}$/i.test(id))||ids[0]===ids[1])
  throw new Error("WS4 QA requires two distinct synthetic Class UUIDs");
for(const key of ["CAN_WS4_QA_FACILITATOR_A_SECRET","CAN_WS4_QA_FACILITATOR_B_SECRET",
  "CAN_WS4_QA_LEARNER_A_SECRET","CAN_WS4_QA_LEARNER_B_SECRET"]){
  if(!process.env[key])throw new Error("WS4 QA missing synthetic persona: "+key);
}
export default defineConfig({
  testDir:"./tests/e2e/read-only",
  testMatch:"ws4-two-site.spec.ts",
  timeout:90_000,expect:{timeout:15_000},
  workers:1,retries:0,reporter:"list",
  use:{baseURL,trace:"retain-on-failure"},
});
