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
  createFileRoute:()=>(options:unknown)=>({options,useLoaderData:()=>({ok:true,data:state.data}),useSearch:()=>({}),useParams:()=>({groupId:"group"})}),
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
import { FieldTripOperationsView } from "@/routes/operations.field-trips";
import { Route as GroupDetail } from "@/routes/groups_.$groupId";

type Props={
  children?:ReactNode;type?:string;value?:string;label?:string;title?:string;
  role?:string;id?:string;hidden?:boolean;"aria-selected"?:boolean;
  main?:ReactNode;rail?:ReactNode;header?:ReactNode;actions?:ReactNode;
  onChange?:(event:{target:{value:string}})=>void;
  onSubmit?:(event:{preventDefault:()=>void})=>void;
  onClick?:()=>unknown;
  onConfirm?:()=>void;
  onClose?:()=>void;
};
function nodes(node:ReactNode):ReactElement<Props>[] {
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!isValidElement<Props>(node))return [];
  if(typeof node.type==="function"&&["TeacherGroupControls","LocalDateTimeField","SiteProgramFields",
    "SessionsPanel","StudentMembershipPanel","DiscussionPanel","ResourcesPanel","MembersPanel","ReportsPanel"].includes(node.type.name))
    return nodes((node.type as (props:Props)=>ReactNode)(node.props));
  return [node,...nodes(node.props.children),...nodes(node.props.main),
    ...nodes(node.props.rail),...nodes(node.props.header),...nodes(node.props.actions)];
}
function text(node:ReactNode):string {
  if(Array.isArray(node))return node.map(text).join("");
  if(isValidElement<Props>(node))return text(node.props.children);
  return typeof node==="string"||typeof node==="number"?String(node):"";
}
function render(route:{options:{component?:unknown}}){
  state.cursor=0;
  const page=(route.options.component as ()=>ReactElement<Props>)();
  return nodes((page.type as (props:Props)=>ReactNode)(page.props));
}
function renderTripForm(){
  state.cursor=0;
  return nodes(FieldTripOperationsView({data:state.data as Parameters<typeof FieldTripOperationsView>[0]["data"],mode:"create"}));
}
function changeLabel(controls:ReactElement<Props>[],label:string,value:string){
  const field=controls.find(node=>((node.type==="label"||node.type===Label)&&text(node.props.children).startsWith(label))||
    (typeof node.props.label==="string"&&node.props.label.startsWith(label)));
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
const availability={enabled:true,writesEnabled:true,membershipEnabled:true,creationEnabled:true,contentEnabled:true,moderationEnabled:true};
const group={id:"group",title:"Study group",timezone,description:"Study together",kind:"course",
  maxMembers:20,memberCount:0,facilitatorName:"Dr. Thorne",membershipStatus:null,
  sessions:[],posts:[],reports:[],roster:[],pendingMembers:[]};
const detailData=(groups:unknown[])=>({availability,workspace:{role:"teacher",hasEnrollmentGuardian:null,sections:[],groups}});
beforeEach(()=>{state.slots=[];state.cursor=0;state.failure=null;vi.clearAllMocks();});

describe("site-local scheduling forms",()=>{
  it("submits trip wall time in the selected school's timezone, not the viewer's",async()=>{
    state.data={sites:[{id:"school",name:"School",timezone}],programs:[],trips:[]};
    let controls=renderTripForm();
    changeLabel(controls,"Departure","2027-01-15T09:30");
    changeLabel(controls,"Return","2027-01-15T14:00");
    changeLabel(controls,"Permission deadline","2027-01-14T16:00");
    controls=renderTripForm();
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
      const controls=renderTripForm();
      changeLabel(controls,"Departure",value);
      changeLabel(controls,"Return","2027-11-07T14:00");
      changeLabel(controls,"Permission deadline","2027-01-14T16:00");
      await submit(renderTripForm());
      expect(state.propose).not.toHaveBeenCalled();
      expect(state.failure).toMatchObject({code:"VALIDATION_FAILED"});
    });
  it("creates and reschedules group sessions in the group's timezone from the detail page",async()=>{
    state.data=detailData([{...group,sessions:[{
      id:"session",title:"Future session",startsAt:"2030-01-15T17:30:00Z",endsAt:"2030-01-15T18:30:00Z",
      cancelled:false,attendance:[],rsvp:null,attended:null,agenda:"",location:"",
    }]}]);
    let controls=render(GroupDetail);
    const toggle=controls.find(node=>node.type==="button"&&text(node.props.children)==="Schedule session");
    toggle?.props.onClick?.();
    controls=render(GroupDetail);
    changeLabel(controls,"Session title","Deep work hour");
    changeLabel(controls,"Start","2030-01-15T09:30");
    changeLabel(controls,"End","2030-01-15T10:30");
    await submit(render(GroupDetail));
    expect(state.schedule).toHaveBeenCalledWith({data:expect.objectContaining({
      groupId:"group",startsAt:"2030-01-15T17:30:00.000Z",endsAt:"2030-01-15T18:30:00.000Z",
    })});
    controls=render(GroupDetail);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Reschedule")?.props.onClick?.();
    controls=render(GroupDetail);
    expect(controls.find(node=>(node.type==="input"||node.type===Input)&&node.props.value==="2030-01-15T09:30")).toBeDefined();
    changeLabel(controls,"New start","2030-01-15T11:00");
    controls=render(GroupDetail);
    controls.find(node=>node.props.onConfirm)?.props.onConfirm?.();
    await state.completed;
    expect(state.revise).toHaveBeenCalledWith({data:expect.objectContaining({startsAt:"2030-01-15T19:00:00.000Z"})});
  });
  it("switches the study group detail tab and exposes its selected panel",()=>{
    state.data=detailData([{...group,posts:[{id:"post",body:"A study question",createdAt:"2030-01-01T18:00:00Z"}]}]);
    let controls=render(GroupDetail);
    const overviewTab=controls.find(node=>node.props.id==="group-tab-overview");
    expect(overviewTab?.props["aria-selected"]).toBe(true);
    expect(controls.find(node=>node.props.id==="group-panel-overview")?.props.hidden).toBe(false);
    controls.find(node=>node.props.id==="group-tab-discussion")?.props.onClick?.();
    controls=render(GroupDetail);
    expect(controls.find(node=>node.props.id==="group-tab-discussion")?.props["aria-selected"]).toBe(true);
    expect(controls.find(node=>node.props.id==="group-panel-discussion")?.props.hidden).toBe(false);
    expect(controls.find(node=>node.props.id==="group-panel-overview")?.props.hidden).toBe(true);
  });
  it("shows an honest empty state for group resources without a canonical resource source",()=>{
    state.data=detailData([{...group}]);
    let controls=render(GroupDetail);
    controls.find(node=>node.props.id==="group-tab-resources")?.props.onClick?.();
    controls=render(GroupDetail);
    expect(controls.find(node=>node.props.id==="group-panel-resources")?.props.hidden).toBe(false);
    expect(controls.some(node=>node.props.title==="Shared learning resources")).toBe(true);
  });
  it("cancels the reschedule dialog without commands and saves local inputs only on confirmation",async()=>{
    state.data=detailData([{...group,sessions:[{id:"session",title:"Review",startsAt:"2027-01-15T17:30:00Z",
      endsAt:"2027-01-15T18:30:00Z",cancelled:false,attendance:[],rsvp:null,attended:null,agenda:"",location:""}]}]);
    let controls=render(GroupDetail);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Reschedule")?.props.onClick?.();
    controls=render(GroupDetail);
    const dialog=()=>controls.find(node=>node.props.onConfirm);
    expect(controls.find(node=>(node.type==="input"||node.type===Input)&&node.props.value==="2027-01-15T09:30")).toBeDefined();
    dialog()?.props.onClose?.();
    expect(state.revise).not.toHaveBeenCalled();
    controls=render(GroupDetail);
    controls.find(node=>node.type==="button"&&text(node.props.children)==="Reschedule")?.props.onClick?.();
    controls=render(GroupDetail);
    changeLabel(controls,"New start","2027-03-14T02:30");
    controls=render(GroupDetail);
    dialog()?.props.onConfirm?.();
    await state.completed;
    expect(state.revise).not.toHaveBeenCalled();
    expect(state.failure).toMatchObject({code:"VALIDATION_FAILED"});
    controls=render(GroupDetail);
    changeLabel(controls,"New start","2027-01-15T11:00");
    controls=render(GroupDetail);
    changeLabel(controls,"New end","2027-01-15T12:00");
    controls=render(GroupDetail);
    dialog()?.props.onConfirm?.();
    await state.completed;
    expect(state.revise).toHaveBeenCalledWith({data:{sessionId:"session",action:"reschedule",
      startsAt:"2027-01-15T19:00:00.000Z",endsAt:"2027-01-15T20:00:00.000Z"}});
  });
});
