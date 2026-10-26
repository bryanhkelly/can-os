import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { EffectCallback } from "react";
import { OperatingAgreementEvidencePicker } from "@/components/networks/OperatingAgreementEvidencePicker";

type Result = { candidates: Array<{id:string;fileName:string;verifiedAt:string;expiresAt:null}>; truncated:boolean };
const state=vi.hoisted(()=>({
  current:()=>({}) as unknown,
  effects:[] as EffectCallback[],
  ref:null as {current:unknown}|null,
}));
vi.mock("@/modules/programs/program-site-authorization.functions",()=>({
  listOperatingAgreementEvidenceFn:vi.fn(),
}));
vi.mock("@tanstack/react-query",async original=>({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery:()=>state.current(),
}));
vi.mock("react",async original=>({
  ...await original<typeof import("react")>(),
  useEffect:(effect:EffectCallback)=>{state.effects.push(effect);},
  useRef:(initial:unknown)=>state.ref??(state.ref={current:initial}),
}));

const valid:Result={candidates:[{id:"doc",fileName:"Agreement.pdf",
  verifiedAt:"2026-01-01T00:00:00.000Z",expiresAt:null}],truncated:false};
let client:QueryClient;
let observer:QueryObserver<Result>;
let stop:()=>void;
let value:string;
let requestId:string;
let through:string;
let pending:{resolve:(result:Result)=>void;reject:(error:Error)=>void};
function render(){
  state.effects=[];
  const tree=OperatingAgreementEvidencePicker({
    authorizationId:requestId,through,value,disabled:false,
    onChange:next=>{value=next;},
  });
  for(const effect of state.effects)effect();
  return tree;
}
beforeEach(()=>{
  state.ref=null;state.effects=[];
  value="doc";requestId="request";through="2099-01-01";
  client=new QueryClient();
  const key=["test-evidence"];
  client.setQueryData(key,valid);
  observer=new QueryObserver<Result>(client,{
    queryKey:key,retry:false,staleTime:Infinity,
    queryFn:()=>new Promise<Result>((resolve,reject)=>{pending={resolve,reject};}),
  });
  state.current=()=>observer.getCurrentResult();
  stop=observer.subscribe(()=>{});
  render();
});
afterEach(()=>{stop();observer.destroy();client.clear();});
describe("evidence selection through real QueryObserver transitions",()=>{
  it("preserves selection during a background fetch and a successful unchanged response",async()=>{
    const request=observer.refetch();
    expect(observer.getCurrentResult().isFetching).toBe(true);
    render();expect(value).toBe("doc");
    pending.resolve(valid);await request;
    render();expect(value).toBe("doc");
  });
  it("retains reviewer input after a refresh error and successful retry",async()=>{
    const request=observer.refetch();
    render();pending.reject(new Error("Connection interrupted"));await request;
    expect(observer.getCurrentResult().isError).toBe(true);
    render();expect(value).toBe("doc");
    const retry=observer.refetch();
    render();expect(value).toBe("doc");
    pending.resolve(valid);await retry;
    render();expect(value).toBe("doc");
  });
  it("clears only after successful refreshed data removes the document",async()=>{
    const request=observer.refetch();
    render();expect(value).toBe("doc");
    pending.resolve({candidates:[],truncated:false});await request;
    render();expect(value).toBe("");
  });
  it.each(["request","date"])("clears a selection when its %s scope changes",change=>{
    if(change==="request")requestId="other-request";
    else through="2099-02-01";
    render();expect(value).toBe("");
  });
  it("clears a selection when the end date becomes invalid",()=>{
    through="";render();expect(value).toBe("");
  });
});
