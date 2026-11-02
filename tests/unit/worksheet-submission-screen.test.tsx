import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,events:[] as string[],submit:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useEffect:()=>{},useRef:()=>({current:0}),
  useState:(initial:unknown)=>{
    const index=state.cursor++;
    if(!(index in state.slots))state.slots[index]=typeof initial==="function"?initial():initial;
    return [state.slots[index],(next:unknown)=>{state.slots[index]=typeof next==="function"?next(state.slots[index]):next;}];
  },
}));
vi.mock("@tanstack/react-router",()=>({
  Link:()=>null,useRouter:()=>({invalidate:async()=>{state.events.push("reload");}}),
  createFileRoute:()=> (options:unknown)=>({options,useSearch:()=>({assessment:"worksheet",section:"section"}),
    useLoaderData:()=>({ok:true,data:{connected:true,assignments:[{
      assessmentId:"worksheet",sectionId:"section",title:"Completed worksheet",course:"Math",status:"assigned",assessmentStatus:"published",
      responseText:"",dueAt:null,score:null,pointsPossible:"10",canEdit:true,
      workAvailability:{actionable:true,reason:null},metadata:{maxAttempts:null,criteria:[]},attempts:[],
    }]}}),
  }),
}));
vi.mock("@/modules/student-experience/assignments.functions",()=>({
  getAssignments:vi.fn(),saveAssignmentDraft:async()=>{state.events.push("save draft");return {saved:true};},
  saveAssignmentResponse:state.submit,
}));
vi.mock("@/modules/learning/submission-attachments.functions",()=>({
  createSubmissionAttachmentUpload:async()=>{state.events.push("authorize upload");return {uploadUrl:"https://private.test/put",documentId:"document"};},
  attachDocumentToSubmission:async()=>{state.events.push("verify and attach");return {attached:true};},
  listSubmissionAttachments:async()=>({attachments:[]}),getSubmissionAttachmentDownload:vi.fn(),
}));
vi.mock("@/components/learning/SubmissionAnnotations",()=>({SubmissionAnnotations:()=>null}));
vi.mock("@/components/learning/AssignmentConversation",()=>({AssignmentConversation:()=>null}));
vi.mock("@/components/student/AssignmentAttemptHistory",()=>({AssignmentAttemptHistory:()=>null}));
import {Route} from "@/routes/student.assignments";
type Props={children?:ReactNode;type?:string;disabled?:boolean;onChange?:(event:unknown)=>void;onClick?:()=>Promise<void>};
function nodes(node:ReactNode):ReactElement<Props>[] {
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!isValidElement<Props>(node))return [];
  return [node,...nodes(node.props.children)];
}
function render(){
  state.cursor=0;
  const page=(Route.options.component as ()=>ReactElement<{data:unknown}>)();
  return nodes((page.type as (props:unknown)=>ReactElement)(page.props));
}
beforeEach(()=>{
  state.slots=[];state.events=[];vi.clearAllMocks();
  state.submit.mockImplementation(async()=>{state.events.push("submit");return {submissionId:"receipt"};});
  vi.stubGlobal("fetch",async()=>{state.events.push("upload bytes");return {ok:true};});
});
afterEach(()=>vi.unstubAllGlobals());
it("lets a student select a worksheet and submit it without filler text, in durable order",async()=>{
  let controls=render();
  expect(controls.find(node=>node.props.children==="Submit assignment")?.props.disabled).toBe(true);
  controls.find(node=>node.props.type==="file")?.props.onChange?.({target:{files:[{name:"worksheet.pdf",size:100}]}});
  controls=render();
  const submit=controls.find(node=>node.props.children==="Submit assignment");
  expect(submit?.props.disabled).toBe(false);
  await submit?.props.onClick?.();
  expect(state.events).toEqual(["save draft","authorize upload","upload bytes","verify and attach","submit","reload"]);
  expect(state.submit).toHaveBeenCalledWith({data:{assessmentId:"worksheet",text:""}});
});
