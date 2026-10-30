import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Groups } from "@/routes/teacher.study-groups";
import { Route as Action } from "@/routes/actions.$actionId";

const state=vi.hoisted(()=>({search:{} as Record<string,unknown>,data:null as unknown}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=>(options:object)=>({
    options,useSearch:()=>state.search,useLoaderData:()=>state.data,
  }),
  useRouter:()=>({invalidate:vi.fn()}),
  Link:({to,search,params,children,...props}:{
    to:string;search?:Record<string,string|undefined>;params?:Record<string,string>;children:ReactNode;
  })=>{
    const path=to.replace(/\$([^/]+)/g,(_,key:string)=>params?.[key]??key);
    const query=new URLSearchParams(Object.entries(search??{}).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
    return <a href={path+(query?"?"+query:"")} {...props}>{children}</a>;
  },
}));
vi.mock("@/modules/study-groups/study-group-queries.functions",()=>({
  listFacilitatorGroupScopes:vi.fn(),listStudyGroupReviewQueue:vi.fn(),listStudyGroupReports:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-workspace.functions",()=>({getStudyGroupAvailability:vi.fn()}));
vi.mock("@/modules/study-groups/canonical-membership.functions",()=>({
  createFacilitatedGroup:vi.fn(),decideCanonicalGroupMembership:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-moderation.functions",()=>({resolveCanonicalGroupReport:vi.fn()}));
vi.mock("@/modules/study-groups/canonical-sessions.functions",()=>({
  createCanonicalGroupSession:vi.fn(),reviseCanonicalGroupSession:vi.fn(),
  listCanonicalGroupAttendance:vi.fn(),recordCanonicalGroupAttendance:vi.fn(),
}));
vi.mock("@/modules/study-groups/facilitator-query.functions",()=>({getFacilitatorStudyGroups:vi.fn()}));
vi.mock("@/modules/actions/action-detail.functions",()=>({getActionDetail:vi.fn()}));

function render(route:{options:{component?:unknown}}){
  const Page=route.options.component;
  if(typeof Page!=="function")throw new Error("Missing component");
  return renderToStaticMarkup(<Page/>);
}
beforeEach(()=>{
  state.search={};
  state.data={ok:true,data:{
    enabled:true,writesEnabled:true,membershipEnabled:true,creationEnabled:true,moderationEnabled:true,scopes:[],
    groups:[
      {id:"english",title:"English group",sessions:[{id:"session",title:"Essay review",startsAt:"2030-01-01",endsAt:"2030-01-02",cancelled:false}]},
      {id:"math",title:"Unrelated math group",sessions:[]},
    ],
    queue:[
      {groupId:"english",groupTitle:"English group",personId:"student",personName:"Jordan"},
      {groupId:"math",groupTitle:"Unrelated math group",personId:"other",personName:"Other student"},
    ],
    reports:[
      {id:"report",groupId:"english",groupTitle:"English group",reason:"Review this post",postBody:"Reported post"},
      {id:"other-report",groupId:"math",groupTitle:"Unrelated math group",reason:"Other report",postBody:"Unrelated post"},
    ],
  }};
});

describe("facilitator record navigation",()=>{
  it("links request, moderation, group and session titles to their exact context",()=>{
    const html=render(Groups);
    expect(html.match(/href="\/teacher\/study-groups\?group=english"/g)).toHaveLength(3);
    expect(html).toContain('href="/teacher/study-groups?group=english&amp;session=session"');
  });
  it("selects the requested group across every queue and highlights its requested session",()=>{
    state.search={group:"english",session:"session"};
    const html=render(Groups);
    expect(html).toContain("English group");
    expect(html).toContain("Reported post");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("All facilitated study groups");
    expect(html).not.toContain("Unrelated math group");
    expect(html).not.toContain("Unrelated post");
    expect(html).not.toContain("Other student");
    expect(html).toMatch(/<option value="english" selected="">/);
  });
  it("does not replace unavailable groups or sessions with another selection",()=>{
    state.search={group:"missing"};
    const missingGroup=render(Groups);
    expect(missingGroup).toContain("This study group is unavailable");
    expect(missingGroup).not.toContain("Essay review");
    expect(missingGroup).not.toContain("Unrelated math group");
    state.search={group:"english",session:"missing"};
    expect(render(Groups)).toContain("This session is unavailable");
    expect(render(Groups)).not.toContain('aria-current="true"');
  });
  it("preserves group/session search parameters and rejects non-string selection values",()=>{
    const validate=Groups.options.validateSearch;
    if(typeof validate!=="function")throw new Error("Missing search validator");
    expect(validate({group:"english",session:"session"})).toEqual({group:"english",session:"session"});
    expect(validate({group:42,session:false})).toEqual({group:undefined,session:undefined});
  });
});

describe("read-only staff Action detail",()=>{
  function action(canManageOperations:boolean,status="open"){
    state.data={ok:true,data:{
      id:"action",title:"Review missing work",description:"Meet the student",type:"academic_intervention",
      status,priority:"high",dueAt:"2030-01-01",resolvedAt:null,resolutionNote:null,
      siteId:"site",programId:"program",canManageOperations,
      workspaceHome:canManageOperations?"/operations":"/teacher",
    }};
    return render(Action);
  }
  it("shows the selected record without exposing registrar commands to other staff",()=>{
    const html=action(false);
    expect(html).toContain("Review missing work");
    expect(html).toContain("Meet the student");
    expect(html).not.toContain('href="/operations');
    expect(html).not.toContain("Mark complete");
    expect(html).toContain('href="/teacher" class="underline">Back to workspace</a>');
  });
  it("links active registrar work to the exact scoped owning workflow, not closed work",()=>{
    expect(action(true)).toContain('href="/operations?action=action&amp;siteId=site&amp;programId=program"');
    expect(action(true,"resolved")).not.toContain("Open owning operations workflow");
  });
  it("renders unavailable records explicitly instead of displaying other Actions",()=>{
    state.data={ok:false,authError:"This action is unavailable in your current staff workspace.",message:"Denied"};
    const html=render(Action);
    expect(html).toContain("This action is unavailable");
    expect(html).not.toContain("Meet the student");
  });
});
