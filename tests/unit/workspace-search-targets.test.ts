import { afterEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { searchWorkspace } from "@/modules/search/global-search.functions";

const state=vi.hoisted(()=>({role:"student",select:vi.fn(),threads:vi.fn(),followUps:vi.fn(async()=>({items:[]})),
  operations:vi.fn(async()=>({items:[]})),dueAt:null as Date|null}));
vi.mock("@/modules/communication/messages.functions",()=>({listMyThreads:state.threads}));
vi.mock("@/modules/learning/teacher-followup-resolution.functions",()=>({getTeacherLearningFollowUps:state.followUps}));
vi.mock("@/modules/operations/action-workspace.functions",()=>({getOperationsActions:state.operations}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator(){return this;},handler(callback:unknown){return callback;}}),
}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/actors.server",()=>({
  requireActor:async()=>({role:state.role,actorPersonId:"actor",scope:{siteIds:["school"],programIds:["program"]}}),
  actorSiteIds:(actor:{scope:{siteIds:string[]}})=>actor.scope.siteIds,
}));
vi.mock("@/db/client",()=>({db:{select:state.select}}));
vi.mock("@neondatabase/serverless",()=>({Pool:class {}}));
vi.mock("drizzle-orm/neon-serverless",()=>({drizzle:()=>({select:state.select})}));

function selectRows(){
    let tableName="";
    return {
      from(table:Table){tableName=getTableName(table);return this;},
      innerJoin(){return this;},where(){return this;},orderBy(){return this;},$dynamic(){return this;},
      limit:async()=>{
        const student={personId:"student",preferredName:null,legalFirstName:"Jordan",legalLastName:"Test",gradeLevel:"9"};
        const rows:Record<string,unknown[]>={
          sections:[{id:"english",title:"English",code:"ENG"}],
          assessments:[{id:"essay",title:"Essay",dueAt:state.dueAt,sectionTitle:"English",sectionId:"english",timezone:"America/Los_Angeles"}],
          guardian_relationships:[student],section_teachers:[student],enrollments:[student],
          communication_threads:[{id:"conversation",subject:"Essay feedback",lastMessageAt:null}],
        };
        return rows[tableName]??[];
      },
    };
}

describe("workspace search result destinations",()=>{
  afterEach(()=>{vi.unstubAllEnvs();state.dueAt=null;});
  it.each(["student","teacher","guardian"] as const)("preserves record context for %s search results",async role=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role=role;
    state.select.mockImplementation(selectRows);
    state.threads.mockResolvedValue({threads:[{id:"conversation",subject:"English feedback",lastMessageAt:"2030-01-01T00:00:00.000Z"}]});
    const result=await searchWorkspace({data:{query:"English"}});
    expect(result.messages[0]?.to).toBe("/messages?thread=conversation");
    if(role==="student"){
      expect(result.courses[0]?.to).toBe("/classes?section=english");
      expect(result.assignments[0]?.to).toBe("/student/assignments?section=english&assessment=essay");
      expect(result.students).toEqual([]);
    }else if(role==="teacher"){
      expect(result.courses[0]?.to).toBe("/classes?section=english");
      expect(result.assignments[0]?.to).toBe("/teacher/gradebook?section=english&assessment=essay");
      expect(result.students[0]?.to).toBe("/staff/students/student");
    }else{
      expect(result.students[0]?.to).toBe("/guardian/students?student=student");
      expect(result.courses).toEqual([]);
      expect(result.assignments).toEqual([]);
    }
  });
  it("searches only conversations returned by the authorized Messages reader",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role="student";
    state.select.mockImplementation(selectRows);
    state.threads.mockResolvedValue({threads:[
      {id:"allowed",subject:"ENGLISH feedback",lastMessageAt:"2030-01-01T00:00:00.000Z"},
      {id:"unrelated",subject:"Math feedback",lastMessageAt:"2030-01-01T00:00:00.000Z"},
    ]});
    const result=await searchWorkspace({data:{query:"English"}});
    expect(result.messages).toEqual([expect.objectContaining({to:"/messages?thread=allowed"})]);
    state.threads.mockResolvedValue({threads:[]});
    expect((await searchWorkspace({data:{query:"English"}})).messages).toEqual([]);
  });
  it("shows assignment deadlines on the canonical school-year date instead of the UTC date",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role="student";
    state.select.mockImplementation(selectRows);
    state.threads.mockResolvedValue({threads:[]});
    state.dueAt=new Date("2030-01-16T01:00:00Z");
    const result=await searchWorkspace({data:{query:"Essay"}});
    expect(result.assignments[0]?.sub).toBe("English · due 2030-01-15");
  });
  it("searches teacher Actions through the authorized follow-up reader",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role="teacher";
    state.select.mockImplementation(selectRows);
    state.threads.mockResolvedValue({threads:[]});
    state.followUps.mockResolvedValueOnce({items:[{id:"follow-up",title:"English review",studentName:"Jordan",
      sectionTitle:"English",status:"in_progress"}]} as never);
    const result=await searchWorkspace({data:{query:"English"}});
    expect(result.actions).toEqual([{id:"action-follow-up",label:"English review",sub:"English · in progress",to:"/actions/follow-up"}]);
    state.role="guardian";
    expect((await searchWorkspace({data:{query:"English"}})).actions).toEqual([]);
  });
  it("opens school Actions with scope and excludes restricted support records",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role="site_admin";
    state.select.mockImplementation(selectRows);
    state.threads.mockResolvedValue({threads:[]});
    state.operations.mockResolvedValueOnce({items:[
      {id:"handoff",title:"English opening handoff",status:"open",siteId:"school",programId:"program",managedBySupport:false},
      {id:"private",title:"English support",status:"open",managedBySupport:true},
    ]} as never);
    expect((await searchWorkspace({data:{query:"English"}})).actions).toEqual([
      expect.objectContaining({to:"/home?action=handoff&siteId=school&programId=program"}),
    ]);
  });
});
