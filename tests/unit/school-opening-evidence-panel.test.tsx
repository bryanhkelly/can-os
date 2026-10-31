import { type EffectCallback, type ReactElement, type SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolOpeningEvidencePanel } from "@/components/operations/SchoolOpeningEvidencePanel";

const state=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effects:[] as EffectCallback[],read:vi.fn()}));
vi.mock("@/modules/operations/school-opening.functions",()=>({getChurchSchoolOpeningFn:state.read}));
vi.mock("@/modules/operations/school-opening-evidence.functions",()=>({
  beginSchoolOpeningEvidenceUploadFn:vi.fn(),finishSchoolOpeningEvidenceUploadFn:vi.fn(),
  reviewSchoolOpeningEvidenceFn:vi.fn(),getSchoolOpeningEvidenceDownloadFn:vi.fn(),
}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:<T,>(initial:T|(()=>T))=>{
    const index=state.cursor++;
    if(!(index in state.slots))state.slots[index]=typeof initial==="function"?(initial as()=>T)():initial;
    return [state.slots[index] as T,(next:SetStateAction<T>)=>{
      state.slots[index]=typeof next==="function"?(next as(value:T)=>T)(state.slots[index] as T):next;
    }];
  },
  useRef:<T,>(initial:T)=>{
    const index=state.cursor++;if(!(index in state.slots))state.slots[index]={current:initial};return state.slots[index];
  },
  useCallback:<T,>(callback:T)=>callback,
  useEffect:(effect:EffectCallback)=>{state.effects.push(effect);},
}));
const item={
  category:"school_opening_facility_approval" as const,title:"Facility approval",status:"rejected" as const,
  responsibleOwner:"Church registrar",nextAction:"Correct the certificate and upload a new version.",
  rejectionReason:"The occupancy certificate is expired.",current:{
    id:"doc",version:2,fileName:"Occupancy.pdf",isCurrent:true,status:"rejected" as const,
    submittedAt:"2026-10-20T00:00:00.000Z",verifiedAt:null,expiresAt:"2027-01-01T00:00:00.000Z",
    reviewReason:"The occupancy certificate is expired.",
  },versions:[] as unknown[],
};
const model={
  programId:"11111111-1111-4111-8111-111111111111",configurationId:"22222222-2222-4222-8222-222222222222",
  version:3,status:"draft",evidenceItems:[item],canSubmit:true,canReview:false,uploadsEnabled:true,
};
function render(){
  state.cursor=0;state.effects=[];
  const wrapper=SchoolOpeningEvidencePanel({programId:model.programId});
  const Workspace=wrapper.type as(props:{programId:string})=>ReactElement;
  return Workspace(wrapper.props);
}
async function loaded(value:typeof model){
  state.read.mockResolvedValue(value);render();state.effects[0]?.();
  await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("Occupancy.pdf"));
}
beforeEach(()=>{vi.clearAllMocks();state.slots=[];state.cursor=0;state.effects=[];});

describe("role-appropriate opening evidence workspace",()=>{
  it("shows the church precise rejection ownership, reason and correction upload",async()=>{
    await loaded(model);
    const html=renderToStaticMarkup(render());
    expect(html).toContain("The occupancy certificate is expired.");
    expect(html).toContain("Responsible: Church registrar");
    expect(html).toContain("Submit a corrected or renewed version");
    expect(html).toContain("Upload a new version for review");
    expect(html).not.toContain("Independent review reason");
  });
  it("gives CAN the independent review action without church self-upload",async()=>{
    await loaded({...model,canSubmit:false,canReview:true,
      evidenceItems:[{...item,status:"pending",rejectionReason:null,
        current:{...item.current,status:"pending",reviewReason:null}}]});
    const html=renderToStaticMarkup(render());
    expect(html).toContain("Independent review reason");
    expect(html).toContain("Verify this version");
    expect(html).toContain("Reject and request correction");
    expect(html).not.toContain("Upload a new version for review");
  });
  it("fails closed to a visible read error instead of stale evidence",async()=>{
    await loaded(model);state.read.mockRejectedValueOnce(new Error("Evidence read unavailable"));
    // A new mount represents route reload; no prior model may be reused.
    state.slots=[];state.cursor=0;state.effects=[];render();state.effects[0]?.();
    await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("Evidence read unavailable"));
    expect(renderToStaticMarkup(render())).not.toContain("Occupancy.pdf");
  });
});
