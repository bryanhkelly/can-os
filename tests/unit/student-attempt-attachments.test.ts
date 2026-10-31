import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state=vi.hoisted(()=>({rows:[] as unknown[][],conditions:[] as unknown[],authorize:vi.fn(),sign:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator:(parse:(v:unknown)=>unknown)=>({
  handler:(fn:(arg:unknown)=>unknown)=>async(arg:{data:unknown})=>fn({data:parse(arg.data)}),
})})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>({
  role:"student",actorPersonId:"person",capabilities:new Set(["assignments:submit"]),
  scope:{siteIds:["site"],programIds:["program"]},
})}));
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:state.authorize}));
vi.mock("@/platform/storage/r2",()=>({signPrivateObjectUrl:state.sign,verifyPrivateObject:vi.fn()}));
vi.mock("@/db/client",()=>{
  const select=()=>{
    const rows=state.rows.shift()??[];
    const query:Record<string,unknown>={};
    for(const method of ["from","innerJoin","orderBy","limit"])query[method]=()=>query;
    query.where=(condition:unknown)=>{state.conditions.push(condition);return query;};
    query.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(rows).then(resolve);
    return query;
  };
  return {db:{select,transaction:async(fn:(tx:unknown)=>unknown)=>fn({select})}};
});
import {getSubmissionAttachmentDownload} from "@/modules/learning/submission-attachments.functions";
const assessmentId="10000000-0000-4000-8000-000000000001",documentId="10000000-0000-4000-8000-000000000002";
const invoke=(attemptNumber?:number)=>getSubmissionAttachmentDownload({data:{assessmentId,documentId,attemptNumber}});
beforeEach(()=>{
  vi.clearAllMocks();state.conditions=[];
  state.authorize.mockResolvedValue({studentProfileId:"student"});
  state.sign.mockReturnValue("https://private.test/download");
  state.rows=[[{id:"student"}],[{id:assessmentId,sectionId:"section",status:"closed"}],
    [{response:{attachments:[documentId]}}],
    [{storageKey:`learning/assignment/${assessmentId}/${documentId}`,verifiedAt:new Date(),mimeType:"application/pdf"}]];
});
describe("student historical attempt files",()=>{
  it("downloads an owned prior attempt's verified file under current enrollment",async()=>{
    await expect(invoke(1)).resolves.toMatchObject({downloadUrl:"https://private.test/download"});
    const query=new PgDialect().sqlToQuery(state.conditions[2] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual([assessmentId,"student",1]);
    expect(state.authorize).toHaveBeenCalled();
  });
  it("does not sign a different attempt's file",async()=>{
    state.rows[2]=[{response:{attachments:[]}}];
    await expect(invoke(2)).rejects.toThrow("selected student submission");
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("denies historical downloads after enrollment authority is withdrawn",async()=>{
    state.authorize.mockRejectedValue(new Error("enrollment withdrawn"));
    await expect(invoke(1)).rejects.toThrow("enrollment withdrawn");
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("keeps latest-attempt downloads compatible when no attempt is selected",async()=>{
    await invoke();
    const query=new PgDialect().sqlToQuery(state.conditions[2] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual([assessmentId,"student"]);
  });
});
