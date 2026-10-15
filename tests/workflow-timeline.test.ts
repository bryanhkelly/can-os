import {describe,it,expect} from "vitest";
import {timelineFromReferralHistory,normalizeTimeline} from "../src/domain/workflow-timeline";
describe("workflow timeline",()=>{it("sorts valid events newest first",()=>{const x=timelineFromReferralHistory("a",[{at:"2026-10-13T12:00:00Z",stage:"submitted"},{at:"2026-10-15T12:00:00Z",stage:"accepted"}]);expect(x.map(v=>v.message)).toEqual(["Referral accepted","Referral submitted"]);});it("rejects invalid timestamps",()=>expect(normalizeTimeline([{id:"x",at:"no",type:"x",message:"x",actorLabel:"x"}])).toEqual([]));});
