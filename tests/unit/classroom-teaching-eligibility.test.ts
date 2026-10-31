import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
const state=vi.hoisted(()=>({rows:[] as unknown[][],require:vi.fn(),authority:vi.fn(),delegation:vi.fn()}));
vi.mock("@/db/client",()=>({db:{select:()=>chain()}}));
function chain():any {
  const result=state.rows.shift()??[];
  return {from(){return this;},innerJoin(){return this;},where(){return this;},
    orderBy(){return Promise.resolve(result);},limit(){return Promise.resolve(result);}};
}
vi.mock("@/modules/staffing/teaching-eligibility.server",()=>({requireTeachingEligibility:state.require}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({requireInstitutionalAcademicProgramAuthority:state.authority}));
vi.mock("@/modules/identity/teaching-eligibility.server",()=>({requireCurrentTeacherProgramDelegation:state.delegation}));
import { accessibleClasses, authorizeClass } from "@/modules/learning/class-access.server";
const section={id:"section",siteId:"site",programId:"program",title:"Class",code:"C"};
const actor=(delegated:boolean)=>({
  role:"teacher",actorPersonId:"teacher",grantSiteId:delegated?null:"site",
  scope:delegated?{organizationIds:["can"],sectionIds:["section"]}:
    {organizationIds:["school"],siteIds:["site"],programIds:["program"]},
} as Actor);
function queue(delegated:boolean){
  state.rows=[[section],[{hostId:"school",ownerId:"school",academicProviderId:delegated?"can":"school"}]];
  if(delegated)state.rows.push([{type:"church"}]);
}
beforeEach(()=>{vi.clearAllMocks();state.rows=[];state.require.mockResolvedValue({eligible:true});});
describe.each([false,true])("classroom eligibility, delegated=%s",delegated=>{
  it("checks current eligibility on direct access and directory reads",async()=>{
    queue(delegated);await expect(authorizeClass(actor(delegated),"section")).resolves.toMatchObject({section});
    queue(delegated);expect(await accessibleClasses(actor(delegated))).toHaveLength(1);
    expect(state.require).toHaveBeenCalledTimes(2);
    for(const call of state.require.mock.calls){
      expect(call[0]).toBe("section");expect(call[1]).toBe("teacher");
      expect(call[3]).toEqual({horizon:"current",requireAssignment:true});
    }
    expect(state.authority).toHaveBeenCalledTimes(delegated?2:0);
    expect(state.delegation).toHaveBeenCalledTimes(delegated?2:0);
  });
  it("denies stale actors after eligibility is revoked",async()=>{
    const signedIn=actor(delegated);
    queue(delegated);await authorizeClass(signedIn,"section");
    state.require.mockRejectedValue(new AuthorizationError("revoked qualification"));
    queue(delegated);await expect(authorizeClass(signedIn,"section")).rejects.toThrow("revoked qualification");
    queue(delegated);expect(await accessibleClasses(signedIn)).toEqual([]);
  });
  it("does not disguise database failures as an empty directory",async()=>{
    state.require.mockRejectedValue(new Error("database unavailable"));
    queue(delegated);await expect(accessibleClasses(actor(delegated))).rejects.toThrow("database unavailable");
  });
});
it("preserves agreement denial before checking qualifications",async()=>{
  state.authority.mockRejectedValueOnce(new AuthorizationError("revoked agreement"));
  queue(true);await expect(authorizeClass(actor(true),"section")).rejects.toThrow("revoked agreement");
  expect(state.require).not.toHaveBeenCalled();
});
it("uses the caller transaction for direct-access eligibility",async()=>{
  const transaction={select:()=>chain()};
  queue(false);await authorizeClass(actor(false),"section",undefined,transaction as never);
  expect(state.require.mock.calls[0]?.[2]).toBe(transaction);
});
