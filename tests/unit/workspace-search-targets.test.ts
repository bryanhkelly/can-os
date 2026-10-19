import { afterEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { searchWorkspace } from "@/modules/search/global-search.functions";

const state=vi.hoisted(()=>({role:"student",select:vi.fn()}));
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
          assessments:[{id:"essay",title:"Essay",dueAt:null,sectionTitle:"English",sectionId:"english"}],
          guardian_relationships:[student],section_teachers:[student],enrollments:[student],
          communication_threads:[{id:"conversation",subject:"Essay feedback",lastMessageAt:null}],
        };
        return rows[tableName]??[];
      },
    };
}

describe("workspace search result destinations",()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it.each(["student","teacher","guardian"] as const)("preserves record context for %s search results",async role=>{
    vi.stubEnv("DATABASE_URL","postgresql://mock.invalid/navigation-test");
    state.role=role;
    state.select.mockImplementation(selectRows);
    const result=await searchWorkspace({data:{query:"English"}});
    expect(result.messages[0]?.to).toBe("/messages?thread=conversation");
    if(role==="student"){
      expect(result.courses[0]?.to).toBe("/student/courses?section=english");
      expect(result.assignments[0]?.to).toBe("/student/assignments?assessment=essay");
      expect(result.students).toEqual([]);
    }else if(role==="teacher"){
      expect(result.courses[0]?.to).toBe("/teacher/gradebook?section=english");
      expect(result.assignments[0]?.to).toBe("/teacher/gradebook?section=english&assessment=essay");
      expect(result.students[0]?.to).toBe("/staff/students/student");
    }else{
      expect(result.students[0]?.to).toBe("/guardian/academics?student=student");
      expect(result.courses).toEqual([]);
      expect(result.assignments).toEqual([]);
    }
  });
});
