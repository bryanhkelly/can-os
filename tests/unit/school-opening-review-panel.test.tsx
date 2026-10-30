import { type EffectCallback, type ReactElement, type ReactNode, type SetStateAction, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolOpeningReviewPanel } from "@/components/operations/SchoolOpeningReviewPanel";

const state=vi.hoisted(()=>({
  slots:[] as unknown[],cursor:0,effects:[] as EffectCallback[],
  read:vi.fn(),decide:vi.fn(),
}));
vi.mock("@/modules/operations/school-opening.functions",()=>({
  getChurchSchoolOpeningFn:state.read,decideChurchSchoolOpeningFn:state.decide,
}));
vi.mock("react",async original=>({
  ...await original<typeof import("react")>(),
  useState:<T,>(initial:T|(()=>T))=>{
    const index=state.cursor++;
    if(!(index in state.slots))state.slots[index]=typeof initial==="function"?(initial as ()=>T)():initial;
    return [state.slots[index] as T,(next:SetStateAction<T>)=>{
      state.slots[index]=typeof next==="function"?(next as (value:T)=>T)(state.slots[index] as T):next;
    }];
  },
  useRef:<T,>(initial:T)=>{
    const index=state.cursor++;
    if(!(index in state.slots))state.slots[index]={current:initial};
    return state.slots[index];
  },
  useCallback:<T,>(callback:T)=>callback,
  useEffect:(effect:EffectCallback)=>{state.effects.push(effect);},
}));

type ControlProps={
  children?:ReactNode;onClick?:()=>void;
  onChange?:(event:{target:{value:string}})=>void;value?:string;disabled?:boolean;
};
function render(){
  state.cursor=0;state.effects=[];
  const wrapper=SchoolOpeningReviewPanel({programId:"11111111-1111-4111-8111-111111111111"});
  const Form=wrapper.type as (props:{programId:string})=>ReactElement;
  return Form(wrapper.props);
}
function controls(node:ReactNode):Array<ReactElement<ControlProps>>{
  if(Array.isArray(node))return node.flatMap(controls);
  if(!isValidElement<ControlProps>(node))return [];
  return [node,...controls(node.props.children)];
}
function words(node:ReactNode):string{
  if(typeof node==="string"||typeof node==="number")return String(node);
  if(Array.isArray(node))return node.map(words).join("");
  return isValidElement<ControlProps>(node)?words(node.props.children):"";
}
function findButton(label:string){
  return controls(render()).find(node=>node.type==="button"&&words(node.props.children).includes(label));
}
function reason(value:string){
  const input=controls(render()).find(node=>node.type==="input");
  if(!input?.props.onChange)throw new Error("Reason field unavailable");
  input.props.onChange({target:{value}});
}
function mount(){
  render();
  const cleanup=state.effects[0]?.();
  return typeof cleanup==="function"?cleanup:()=>{};
}
const review={
  programId:"11111111-1111-4111-8111-111111111111",
  configurationId:"22222222-2222-4222-8222-222222222222",
  approvalReady:true,prerequisites:[
    {id:"evidence",title:"Independent opening evidence",satisfied:true,detail:"Evidence is current."},
    {id:"agreement",title:"CAN–church service agreement",satisfied:true,detail:"Agreement is current."},
    {id:"director",title:"Church Site director",satisfied:true,detail:"Director is appointed."},
  ],evidence:[],evidenceIssue:null,version:1,status:"draft",evidenceReady:true,evidenceRequired:["facility"],approvedAt:null,
  canDecide:true,
};
beforeEach(()=>{
  vi.clearAllMocks();state.slots=[];state.cursor=0;state.effects=[];
  state.read.mockResolvedValue(review);state.decide.mockResolvedValue({status:"approved"});
});
async function loaded(){
  mount();
  await vi.waitFor(()=>expect(findButton("Approve independently")).toBeDefined());
}

describe("version-bound school-opening review",()=>{
  it("sends the configuration displayed to the reviewer",async()=>{
    await loaded();reason("Independently reviewed this exact configuration.");
    const approve=findButton("Approve independently");
    expect(approve?.props.disabled).toBe(false);
    approve?.props.onClick?.();
    await vi.waitFor(()=>expect(state.decide).toHaveBeenCalledOnce());
    expect(state.decide.mock.calls[0]?.[0]).toEqual({data:{
      programId:review.programId,configurationId:review.configurationId,
      expectedVersion:1,decision:"approve",
      reason:"Independently reviewed this exact configuration.",
    }});
    await vi.waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));
  });
  it("does not expose decision buttons before a review has loaded",()=>{
    state.read.mockReturnValue(new Promise(()=>{}));mount();
    expect(findButton("Approve independently")).toBeUndefined();
    expect(findButton("Suspend school")).toBeUndefined();
  });
  it("requires a deliberate reload and a new reason after a stale decision",async()=>{
    state.decide.mockRejectedValueOnce(new Error("School configuration changed. Reload the review."));
    await loaded();reason("Reason about version one only.");
    findButton("Approve independently")?.props.onClick?.();
    await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("School configuration changed"));
    expect(state.read).toHaveBeenCalledTimes(1);
    state.read.mockResolvedValue({...review,version:2,configurationId:"33333333-3333-4333-8333-333333333333"});
    findButton("Reload review")?.props.onClick?.();
    await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("Configuration v2"));
    const input=controls(render()).find(node=>node.type==="input");
    expect(input?.props.value).toBe("");
    expect(findButton("Approve independently")?.props.disabled).toBe(true);
    expect(state.decide).toHaveBeenCalledOnce();
  });
  it("does not misreport a saved decision as failed if the subsequent read fails",async()=>{
    state.read.mockResolvedValueOnce(review).mockRejectedValue(new Error("Review read unavailable"));
    await loaded();reason("Independently reviewed the opening evidence.");
    findButton("Approve independently")?.props.onClick?.();
    await vi.waitFor(()=>{
      const html=renderToStaticMarkup(render());
      expect(html).toContain("Institutional opening approval recorded");
      expect(html).toContain("Review read unavailable");
    });
    expect(findButton("Approve independently")).toBeUndefined();
    expect(state.decide).toHaveBeenCalledOnce();
  });
  it("ignores a review response that arrives after the component was disposed",async()=>{
    let resolve!:(value:typeof review)=>void;
    state.read.mockReturnValue(new Promise<typeof review>(done=>{resolve=done;}));
    const cleanup=mount();cleanup();resolve(review);
    await Promise.resolve();await Promise.resolve();
    expect(findButton("Approve independently")).toBeUndefined();
  });
});

it("renders shared evidence details and hides them on a failed reload",async()=>{
  state.read.mockResolvedValue({...review,evidence:[{
    id:"doc",category:"school_opening_facility_approval",fileName:"Facility review.pdf",
    verifiedAt:"2026-10-20T00:00:00.000Z",expiresAt:"2027-10-20T00:00:00.000Z",
  }]});
  await loaded();
  const html=renderToStaticMarkup(render());
  expect(html).toContain("Facility review.pdf");expect(html).toContain("Expires:");
  expect(html).toContain("facility approval");
  state.read.mockRejectedValueOnce(new Error("Read unavailable"));
  findButton("Reload review")?.props.onClick?.();
  await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("Read unavailable"));
  expect(renderToStaticMarkup(render())).not.toContain("Facility review.pdf");
});

it("blocks approval for a missing director even when evidence and contract are valid",async()=>{
  state.read.mockResolvedValue({...review,approvalReady:false,prerequisites:review.prerequisites.map(
    item=>item.id==="director"?{...item,satisfied:false,detail:"Appoint a current verified director."}:item)});
  await loaded();reason("Independently reviewed the opening evidence.");
  expect(findButton("Approve independently")?.props.disabled).toBe(true);
  const html=renderToStaticMarkup(render());
  expect(html).toContain("Church Site director");expect(html).toContain("Needs attention");
  expect(html).toContain("Appoint a current verified director.");
});
it("keeps emergency suspension available when prerequisites are blocked",async()=>{
  state.read.mockResolvedValue({...review,status:"approved",approvalReady:false,
    prerequisites:review.prerequisites.map(item=>({...item,satisfied:false}))});
  mount();
  await vi.waitFor(()=>expect(findButton("Suspend school")).toBeDefined());
  reason("Suspend while current operating prerequisites are unavailable.");
  expect(findButton("Suspend school")?.props.disabled).toBe(false);
  findButton("Suspend school")?.props.onClick?.();
  await vi.waitFor(()=>expect(state.decide).toHaveBeenCalledOnce());
  expect(state.decide.mock.calls[0]?.[0].data.decision).toBe("suspend");
});
