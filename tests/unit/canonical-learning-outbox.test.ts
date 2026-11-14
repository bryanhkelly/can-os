import { describe, expect, it } from "vitest";
import {
  drainLearningOutbox,pruneLearningOutbox,MAX_LEARNING_OUTBOX_EVENTS,
} from "@/domain/canonical-learning-outbox";

const sessionId="11111111-1111-4111-8111-111111111111";
const lessonId="22222222-2222-4222-8222-222222222222";
const now=new Date("2026-11-14T20:00:00.000Z");
const item=(n:number,at=new Date(now.getTime()-20_000),id=sessionId)=>({
  learningSessionId:id,event:{
    clientEventId:"00000000-0000-4000-8000-"+n.toString().padStart(12,"0"),
    kind:"lesson_opened" as const,lessonId,resourceId:null,occurredAt:at.toISOString(),
  },
});
describe("canonical tab-scoped activity retry",()=>{
  it("prunes old observations, other logins and malformed local storage",()=>{
    expect(pruneLearningOutbox([
      item(1),item(2,new Date(now.getTime()-310_000)),
      item(3,new Date(now.getTime()-20_000),"33333333-3333-4333-8333-333333333333"),
      {learningSessionId:sessionId,event:{kind:"assessment_submitted"}},
    ],sessionId,now)).toEqual([item(1)]);
    expect(pruneLearningOutbox("not an array",sessionId,now)).toEqual([]);
  });
  it("caps retained events so browser storage cannot grow without bound",()=>{
    const result=pruneLearningOutbox(
      Array.from({length:100},(_,i)=>item(i+1)),sessionId,now,
    );
    expect(result).toHaveLength(MAX_LEARNING_OUTBOX_EVENTS);
    expect(result[0]!.event.clientEventId).toBe(item(53).event.clientEventId);
  });
  it("retains the original event UUID for deduplicated retries",async()=>{
    const list=[item(1),item(2),item(3)];
    const sent:string[]=[];
    const blocked=await drainLearningOutbox(list,async x=>{
      if(x.event.clientEventId===item(2).event.clientEventId)
        throw new Error("network");
      sent.push(x.event.clientEventId);
    });
    expect(sent).toEqual([item(1).event.clientEventId]);
    expect(blocked.failed).toBe(true);
    expect(blocked.remaining).toEqual([item(2),item(3)]);
    const recovered=await drainLearningOutbox(blocked.remaining,async x=>{
      sent.push(x.event.clientEventId);
    });
    expect(recovered).toEqual({remaining:[],failed:false});
    expect(sent).toEqual(list.map(x=>x.event.clientEventId));
  });
});
