import type { Dispatch, ReactNode, SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/operations.insights";
import { acceptInsight, listInsights, listInsightScopeOptions } from "@/modules/operations/insights.functions";

const state=vi.hoisted(()=>({
  search:{} as Record<string,unknown>,values:[] as unknown[],cursor:0,
  effects:[] as (()=>unknown)[],accept:undefined as (()=>Promise<void>)|undefined,
}));
vi.mock("react",async importOriginal=>({
  ...await importOriginal<typeof import("react")>(),
  useState<T,>(initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>]{
    const index=state.cursor++;
    if(!(index in state.values))state.values[index]=typeof initial==="function"?(initial as ()=>T)():initial;
    return [state.values[index] as T,value=>{
      state.values[index]=typeof value==="function"?(value as (previous:T)=>T)(state.values[index] as T):value;
    }];
  },
  useEffect:(effect:()=>unknown)=>{state.effects.push(effect);},
}));
vi.mock("react/jsx-runtime",async importOriginal=>{
  const runtime=await importOriginal<typeof import("react/jsx-runtime")>();
  const capture=(type:unknown,props:unknown)=>{
    if(type==="button"&&props&&typeof props==="object"&&"children" in props&&
      props.children==="Accept & create Action"&&"onClick" in props){
      state.accept=props.onClick as ()=>Promise<void>;
    }
  };
  return {...runtime,
    jsx:(...args:Parameters<typeof runtime.jsx>)=>{capture(args[0],args[1]);return runtime.jsx(...args);},
    jsxs:(...args:Parameters<typeof runtime.jsxs>)=>{capture(args[0],args[1]);return runtime.jsxs(...args);},
  };
});
vi.mock("react/jsx-dev-runtime",async importOriginal=>{
  const runtime=await importOriginal<typeof import("react/jsx-dev-runtime")>();
  return {...runtime,jsxDEV:(...args:Parameters<typeof runtime.jsxDEV>)=>{
    const [type,props]=args;
    if(type==="button"&&props&&typeof props==="object"&&"children" in props&&
      props.children==="Accept & create Action"&&"onClick" in props){
      state.accept=props.onClick as ()=>Promise<void>;
    }
    return runtime.jsxDEV(...args);
  }};
});
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=>(options:object)=>({options,useSearch:()=>state.search}),
  useNavigate:()=>vi.fn(),
  Link:({to,search,params,children,...props}:{
    to:string;search?:Record<string,string|undefined>;params?:Record<string,string>;children:ReactNode;
  })=>{
    const path=to.replace(/\$([^/]+)/g,(_,key:string)=>params?.[key]??key);
    const query=new URLSearchParams(Object.entries(search??{}).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
    return <a href={path+(query?"?"+query:"")} {...props}>{children}</a>;
  },
}));
vi.mock("@/modules/operations/insights.functions",()=>({
  acceptInsight:vi.fn(),dismissInsight:vi.fn(),listInsights:vi.fn(),listInsightScopeOptions:vi.fn(),
}));

function render(){
  state.cursor=0;state.effects=[];state.accept=undefined;
  const Page=Route.options.component!;
  return renderToStaticMarkup(<Page/>);
}
async function mount(){
  render();
  state.effects.forEach(effect=>effect());
  await vi.waitFor(()=>expect(render()).not.toContain("Loading insights"));
}
beforeEach(()=>{
  vi.clearAllMocks();state.search={};state.values=[];
  vi.mocked(listInsightScopeOptions).mockResolvedValue([]);
  vi.mocked(listInsights).mockResolvedValue({insights:[{
    id:"signal",title:"Review missing work",type:"academic",status:"open",summary:"Review the evidence",
    subjectType:"student_profile",subjectId:"student",subjectName:"Jordan",
    evidence:[],uncertainty:null,recommendedActions:[],createdAt:"2030-01-01",
  }]});
  vi.mocked(acceptInsight).mockResolvedValue({actionId:"created-action"});
});

describe("insight record navigation",()=>{
  it("preserves scope and selected insight when loading and linking the record",async()=>{
    state.search={siteId:"site",programId:"program",insight:"signal"};
    await mount();
    expect(listInsights).toHaveBeenCalledWith({data:{
      status:"open",siteId:"site",programId:"program",insightId:"signal",
    }});
    const html=render();
    expect(html).toContain('href="/operations/insights?siteId=site&amp;programId=program&amp;insight=signal"');
    expect(html).toContain('href="/operations/insights?siteId=site&amp;programId=program"');
    expect(html).not.toContain('role="tablist"');
  });
  it("links to the actual Action returned by acceptance",async()=>{
    await mount();
    if(!state.accept)throw new Error("Missing acceptance control");
    await state.accept();
    expect(acceptInsight).toHaveBeenCalledWith({data:{insightId:"signal"}});
    const html=render();
    expect(html).toContain('href="/actions/created-action"');
    expect(html).toContain("Open created Action");
    expect(html).not.toContain('href="/actions/signal"');
  });
  it("does not show a stale Action link after a failed subsequent acceptance",async()=>{
    await mount();
    await state.accept!();
    render();
    vi.mocked(acceptInsight).mockRejectedValueOnce(new Error("Already handled"));
    await state.accept!();
    const html=render();
    expect(html).toContain("Already handled");
    expect(html).not.toContain("Open created Action");
  });
  it("reports unavailable selected insights without showing another record",async()=>{
    state.search={insight:"missing"};
    vi.mocked(listInsights).mockResolvedValue({insights:[]});
    await mount();
    const html=render();
    expect(html).toContain("This insight is unavailable");
    expect(html).not.toContain("Review missing work");
  });
});
