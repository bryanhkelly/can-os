import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const state=vi.hoisted(()=>({
  slots:[] as unknown[],cursor:0,data:{} as unknown,
  completed:Promise.resolve() as Promise<unknown>,failure:null as unknown,
  propose:vi.fn(),schedule:vi.fn(),revise:vi.fn(),
}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useEffect:()=>{},
  useState:(initial:unknown)=>{
    const index=state.cursor++;
    if(!(index in state.slots))state.slots[index]=typeof initial==="function"?initial():initial;
    return [state.slots[index],(next:unknown)=>{
      state.slots[index]=typeof next==="function"?next(state.slots[index]):next;
    }];
  },
}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=>(options:unknown)=>({options,useLoaderData:()=>({ok:true,data:state.data}),useSearch:()=>({})}),
  useRouter:()=>({invalidate:async()=>{}}),Link:()=>null,
}));
vi.mock("@/lib/mutation-feedback",()=>({useMutationFeedback:()=>({
  pending:false,refreshFailed:false,error:"",notice:"",
  run:(operation:()=>Promise<unknown>)=>{
    state.failure=null;
    state.completed=Promise.resolve().then(operation).then(value=>({status:"saved",value}))
      .catch(error=>{state.failure=error;return {status:"failed",error};});
    return state.completed;
  },
})}));
vi.mock("@/modules/field-trips/field-trip-operations.functions",()=>({
  listFieldTripOperations:vi.fn(),proposeCanonicalFieldTrip:state.propose,
  approveCanonicalFieldTrip:vi.fn(),inviteCanonicalFieldTripStudent:vi.fn(),
}));
vi.mock("@/modules/field-trips/field-trip-attendance.functions",()=>({recordCanonicalFieldTripCheckpoint:vi.fn()}));
vi.mock("@/modules/study-groups/canonical-workspace.functions",()=>({
  getCanonicalGroupWorkspace:vi.fn(),getStudyGroupAvailability:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-membership.functions",()=>({
  createFacilitatedGroup:vi.fn(),inviteCanonicalGroupMembers:vi.fn(),listCanonicalGroupInvitees:vi.fn(),
  requestCanonicalGroupMembership:vi.fn(),decideCanonicalGroupMembership:vi.fn(),leaveCanonicalGroup:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-moderation.functions",()=>({
  createCanonicalGroupPost:vi.fn(),reportCanonicalGroupPost:vi.fn(),resolveCanonicalGroupReport:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-sessions.functions",()=>({
  createCanonicalGroupSession:state.schedule,reviseCanonicalGroupSession:state.revise,
  rsvpCanonicalGroupSession:vi.fn(),recordCanonicalGroupAttendance:vi.fn(),listCanonicalGroupAttendance:vi.fn(),
}));
vi.mock("@/modules/study-groups/study-group-queries.functions",()=>({
  listFacilitatorGroupScopes:vi.fn(),listStudyGroupReviewQueue:vi.fn(),listStudyGroupReports:vi.fn(),
}));
vi.mock("@/modules/study-groups/facilitator-query.functions",()=>({getFacilitatorStudyGroups:vi.fn()}));
import { Route as Trips } from "@/routes/operations.field-trips";
import { Route as Groups } from "@/routes/groups";
import { Route as TeacherGroups } from "@/routes/teacher.study-groups";

type Props={
  children?:ReactNode;type?:string;value?:string;
  onChange?:(event:{target:{value:string}})=>void;
  onSubmit?:(event:{preventDefault:()=>void})=>void;
  onClick?:()=>unknown;
  onConfirm?:()=>void;
  onClose?:()=>void;
};
function nodes(node:ReactNode):ReactElement<Props>[] {
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!isValidElement<Props>(node))return [];
  if(typeof node.type==="function"&&["TeacherGroupControls","LocalDateTimeField","SiteProgramFields"].includes(node.type.name))
    return nodes((node.type as (props:Props)=>ReactNode)(node.props));
  // RecordLayout places the active page in a typed `main` slot, not children.
  return [node,...nodes(node.props.children),...nodes((node.props as Props & {main?:ReactNode}).main)];
}
function text(node:ReactNode):string {
  if(Array.isArray(node))return node.map(text).join("");
  if(isValidElement<Props>(node))return text(node.props.children);
  return typeof node==="string"||typeof node==="number"?String(node):"";
}
function render(route:{options:{component?:unknown}}){
  state.cursor=0;
  const page=(route.options.component as ()=>ReactElement<Props>)();
  // Scheduling moved from the list page into its canonical /new route.
  const props=route===Trips?{...page.props,mode:"create"}:page.props;
  return nodes((page.type as (props:Props)=>ReactNode)(props));
}
function changeLabel(controls:ReactElement<Props>[],label:string,value:string){
  const field=controls.find(node=>(node.type==="label"||node.type===Label)&&text(node.props.children).startsWith(label));
  const input=field&&nodes(field.props.children).find(node=>node.type==="input"||node.type==="select"||node.type===Input||node.type===Select);
  if(!input?.props.onChange)throw new Error(`Missing input ${label}`);
  input.props.onChange({target:{value}});
}
function submit(controls:ReactElement<Props>[]){
  const form=controls.find(node=>node.type==="form"&&node.props.onSubmit&&
    nodes(node.props.children).some(child=>child.props.type==="datetime-local"));
  if(!form?.props.onSubmit)throw new Error("Missing form");
  form.props.onSubmit({preventDefault:()=>{}});
  return state.completed;
}
const timezone="America/Los_Angeles";
const group={id:"group",title:"Study group",timezone,description:"Study together",kind:"course",
  sessions:[],posts:[],reports:[],roster:[],pendingMembers:[],approvedCount:0};
beforeEach(()=>{state.slots=[];state.cursor=0;state.failure=null;vi.clearAllMocks();});

describe("site-local scheduling forms",()=>{
  it("submits trip wall time in the selected school's timezone, not the viewer's",async()=>{
    state.data={sites:[{id:"school",name:"School",timezone}],programs:[],trips:[]};
    let controls=render(Trips);
    changeLabel(controls,"Departure","2027-01-15T09:30");
    changeLabel(controls,"Return","2027-01-15T14:00");
    changeLabel(controls,"Permission deadline","2027-01-14T16:00");
    controls=render(Trips);
    expect(controls.some(node=>(node.type==="label"||node.type===Label)&&text(node.props.children).includes(timezone))).toBe(true);
    await submit(controls);
    expect(state.propose).toHaveBeenCalledWith({data:expect.objectContaining({
      siteId:"school",departsAt:"2027-01-15T17:30:00.000Z",
      returnsAt:"2027-01-15T22:00:00.000Z",permissionDueAt:"2027-01-15T00:00:00.000Z",
    })});
  });
  it.each(["2027-03-14T02:30","2027-11-07T01:30","2027-02-30T09:30"])(
    "does not submit invalid, nonexistent or ambiguous trip time %s",async value=>{
      state.data={sites:[{id:"school",name:"School",timezone}],programs:[],trips:[]};
      const controls=render(Trips);
      changeLabel(controls,"Departure",value);
      changeLabel(controls,"Return","2027-11-07T14:00");
      changeLabel(controls,"Permission deadline","2027-01-14T16:00");
      await submit(render(Trips));
      expect(state.propose).not.toHaveBeenCalled();
      expect(state.failure).toMatchObject({code:"VALIDATION_FAILED"});
    });
  it("creates and reschedules shared-workspace sessions in the group's timezone",async()=>{
    state.data={role:"teacher",sections:[],groups:[{...group,sessions:[{
      id:"session",title:"Future session",startsAt:"2030-01-15T17:30:00Z",endsAt:"2030-01-15T18:30:00Z",cancelled:false,attendance:[],
    }]}]};
    let controls=render(Groups);
    const toggle=controls.find(node=>node.type==="button"&&text(node.props.children)==="Schedule session");
    toggle?.props.onClick?.();
    controls=render(Groups);
    changeLabel(controls,"Start","2030-01-15T09:30");
    changeLabel(controls,"End","2030-01-15T10:30");
    await submit(render(Groups));
    expect(state.schedule).toHaveBeenCalledWith({data:expect.objectContaining({
      startsAt:"2030-01-15T17:30:00.000Z",endsAt:"2030-01-15T18:30:00.000Z",
    })});
    controls=render(Groups);
    const edit=controls.find(node=>node.type==="div"&&text(node.props.children).startsWith("Change Future session"));
    if(!edit)throw new Error("Missing reschedule controls");
    expect(nodes(edit).find(node=>node.type==="input")?.props.value).toBe("2030-01-15T09:30");
    changeLabel(nodes(edit),"Start","2030-01-15T11:00");
    controls=render(Groups);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Save time")?.props.onClick?.();
    await state.completed;
    expect(state.revise).toHaveBeenCalledWith({data:expect.objectContaining({startsAt:"2030-01-15T19:00:00.000Z"})});
  });
  it("schedules from the teacher workspace using the selected group timezone",async()=>{
    state.data={enabled:true,writesEnabled:true,membershipEnabled:true,creationEnabled:true,moderationEnabled:true,
      queue:[],reports:[],groups:[group],scopes:[]};
    let controls=render(TeacherGroups);
    controls.find(node=>node.type==="select")?.props.onChange?.({target:{value:"group"}});
    changeLabel(controls,"Starts at","2027-07-15T09:30");
    changeLabel(controls,"Ends at","2027-07-15T10:30");
    controls=render(TeacherGroups);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Schedule")?.props.onClick?.();
    await state.completed;
    expect(state.schedule).toHaveBeenCalledWith({data:expect.objectContaining({
      startsAt:"2027-07-15T16:30:00.000Z",endsAt:"2027-07-15T17:30:00.000Z",
    })});
  });
  it("cancels the reschedule dialog without commands and saves local inputs only on confirmation",async()=>{
    state.data={enabled:true,writesEnabled:true,membershipEnabled:true,creationEnabled:true,moderationEnabled:true,
      queue:[],reports:[],groups:[{...group,sessions:[{id:"session",title:"Review",startsAt:"2027-01-15T17:30:00Z",
        endsAt:"2027-01-15T18:30:00Z",cancelled:false}]}],scopes:[]};
    let controls=render(TeacherGroups);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Reschedule")?.props.onClick?.();
    controls=render(TeacherGroups);
    const dialog=()=>controls.find(node=>node.props.onConfirm);
    expect(controls.find(node=>(node.type==="input"||node.type===Input)&&node.props.value==="2027-01-15T09:30")).toBeDefined();
    dialog()?.props.onClose?.();
    expect(state.revise).not.toHaveBeenCalled();
    controls=render(TeacherGroups);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Reschedule")?.props.onClick?.();
    controls=render(TeacherGroups);
    changeLabel(controls,"New start","2027-03-14T02:30");
    controls=render(TeacherGroups);
    dialog()?.props.onConfirm?.();
    await state.completed;
    expect(state.revise).not.toHaveBeenCalled();
    expect(state.failure).toMatchObject({code:"VALIDATION_FAILED"});
    controls=render(TeacherGroups);
    changeLabel(controls,"New start","2027-01-15T11:00");
    controls=render(TeacherGroups);
    changeLabel(controls,"New end","2027-01-15T12:00");
    controls=render(TeacherGroups);
    dialog()?.props.onConfirm?.();
    await state.completed;
    expect(state.revise).toHaveBeenCalledWith({data:{sessionId:"session",action:"reschedule",
      startsAt:"2027-01-15T19:00:00.000Z",endsAt:"2027-01-15T20:00:00.000Z"}});
  });
});
