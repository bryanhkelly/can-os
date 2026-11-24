import {describe,expect,it} from "vitest";
import {orderedBatches} from "@/lib/ordered-batches";

describe("ordered bounded asynchronous loading",()=>{
  it("keeps input order and does not start a later batch before consumption",async()=>{
    const started:number[]=[];
    const batch=orderedBatches([1,2,3,4],2,async item=>{
      started.push(item);
      if(item===1)await Promise.resolve();
      return item*10;
    });
    expect(started).toEqual([]);
    expect(await batch.next()).toEqual({done:false,value:[10,20]});
    expect(started).toEqual([1,2]);
    await batch.return(undefined);
    expect(started).toEqual([1,2]);
  });
  it("preserves all results and handles partial and empty batches",async()=>{
    const batches:number[][]=[];
    for await(const result of orderedBatches([1,2,3,4,5],2,async item=>item))batches.push(result);
    expect(batches).toEqual([[1,2],[3,4],[5]]);
    expect(await orderedBatches([],2,async item=>item).next()).toMatchObject({done:true});
  });
  it("rejects invalid limits before starting a loader and propagates unexpected failures",async()=>{
    let called=false;
    const load=async()=>{called=true;return 1;};
    for(const size of [0,-1,1.5,Infinity,NaN]){
      await expect(orderedBatches([1],size,load).next()).rejects.toThrow(RangeError);
    }
    expect(called).toBe(false);
    await expect(orderedBatches([1],1,async()=>{throw new Error("failed");}).next()).rejects.toThrow("failed");
  });
});
