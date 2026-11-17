import {describe,expect,it} from "vitest";
import {readBoundedNativeClassHistory,type NativeClassHistoryCursor} from
  "@/domain/native-class-history-pagination";

type Row = {classEnrollmentId: string; status: string};
const row = (n:number):Row => ({classEnrollmentId:"enrollment-"+n,status:"withdrawn"});
const cursor = (n:number):NativeClassHistoryCursor =>
  ({enrolledAt:"2026-11-16T12:00:00.000000Z",classEnrollmentId:"enrollment-"+n});

describe("WS1 + WS2 My Activity canonical Class history pagination",()=>{
  it("retains history beyond the original 100-row reader cap",async()=>{
    const calls: (NativeClassHistoryCursor|null)[]=[];
    const result=await readBoundedNativeClassHistory(async last=>{
      calls.push(last);
      const start=calls.length===1?0:calls.length===2?50:100;
      return {
        items:Array.from({length:start===100?20:50},(_,i)=>row(start+i)),
        nextCursor:start===100?null:cursor(start+49),
      };
    });
    expect(result.items).toHaveLength(120);
    expect(result.items.at(-1)?.classEnrollmentId).toBe("enrollment-119");
    expect(result.hasMore).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toEqual(cursor(49));
  });
  it("fails closed on duplicate authoritative source Enrollment IDs",async()=>{
    let n=0;
    await expect(readBoundedNativeClassHistory(async()=>{
      n++;
      return n===1?{items:[row(1)],nextCursor:cursor(1)}:
        {items:[row(1)],nextCursor:null};
    })).rejects.toThrow("Duplicate or missing native Class Enrollment");
  });
  it("rejects stagnant cursors and empty continued pages",async()=>{
    await expect(readBoundedNativeClassHistory(async()=>({
      items:[row(1)],nextCursor:cursor(1),
    }))).rejects.toThrow("pagination did not advance");
    await expect(readBoundedNativeClassHistory(async()=>({
      items:[],nextCursor:cursor(2),
    }))).rejects.toThrow("pagination did not advance");
  });
  it("reports an explicit truncation signal at its bounded source limit",async()=>{
    let n=0;
    const result=await readBoundedNativeClassHistory(async()=>{
      n++;
      return {items:[row(n)],nextCursor:cursor(n)};
    },2);
    expect(result).toMatchObject({hasMore:true});
    expect(result.items).toHaveLength(2);
    expect(n).toBe(2);
  });
  it("rejects invalid local bounds and oversized source pages",async()=>{
    const page=async()=>({items:[],nextCursor:null});
    await expect(readBoundedNativeClassHistory(page,0)).rejects.toThrow("bound");
    await expect(readBoundedNativeClassHistory(async()=>({
      items:Array.from({length:51},(_,i)=>row(i)),nextCursor:null,
    }))).rejects.toThrow("Invalid native Class history page");
  });
});
