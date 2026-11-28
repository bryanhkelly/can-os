import {beforeEach,describe,expect,it,vi} from "vitest";
import {accessSessionCookie} from "@/domain/access-tokens";
import {canonicalSessionCookie} from "@/domain/canonical-access";
const state=vi.hoisted(()=>({can:vi.fn(),canonical:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:state.can}));
vi.mock("@/modules/identity/canonical-command-context.server",()=>({getCanonicalCommandContext:state.canonical,getCanonicalSessionRow:()=>{throw Error("second native read forbidden");}}));
import {getInstructionalLearnerContext,getInstructionalLearnerSession} from "@/modules/identity/learning-command-context.server";
const actor={role:"student",actorPersonId:"same-person",sessionId:"can-session"};
const adult={role:"learner",actorPersonId:"same-person",nativeLearningSessionId:"verified-native-session"};
const req=(dual=false)=>new Request("https://can.example/learn",{headers:{cookie:accessSessionCookie+"="+"a".repeat(43)+(dual?"; "+canonicalSessionCookie+"="+"b".repeat(43):"")}});
beforeEach(()=>{vi.clearAllMocks();state.can.mockResolvedValue(actor);state.canonical.mockResolvedValue(adult);});
describe("instructional session provenance",()=>{
 it("keeps direct CAN identity and session together",async()=>{
  expect(await getInstructionalLearnerSession(req())).toEqual({context:actor,sessionId:"can-session"});
  expect(state.canonical).not.toHaveBeenCalled();
 });
 it.each([{...actor},{...actor,nativeLearningSessionId:"unrelated"},{role:"learner",actorPersonId:"same-person"}])("rejects unbound dual-cookie context %j",async context=>{
  state.canonical.mockResolvedValue(context);
  await expect(getInstructionalLearnerContext(req(true))).rejects.toThrow("verified matching native learner session");
  await expect(getInstructionalLearnerSession(req(true))).rejects.toThrow("verified matching native learner session");
 });
 it("uses the exact session returned by the already verified adult identity resolver",async()=>{
  expect(await getInstructionalLearnerSession(req(true))).toEqual({context:adult,sessionId:adult.nativeLearningSessionId});
  expect(state.canonical).toHaveBeenCalledTimes(1);
 });
 it("refuses to attribute owner-delegated telemetry as learner activity",async()=>{
  state.can.mockResolvedValue({...actor,delegatedByPlatformOwner:true,delegationMode:"act"});
  await expect(getInstructionalLearnerSession(req())).rejects.toThrow("direct learner activity session");
 });
});
