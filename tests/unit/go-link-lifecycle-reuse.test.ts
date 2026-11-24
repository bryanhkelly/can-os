import {beforeEach,describe,expect,it,vi} from "vitest";
import type {AccessContext} from "@/domain/access-context";
const mocks=vi.hoisted(()=>({audit:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:mocks.audit}));
vi.mock("@/db/schema",()=>({siteGoLinks:{id:{},code:{}}}));
vi.mock("drizzle-orm",()=>({and:vi.fn(),eq:vi.fn(),sql:vi.fn()}));
import {issueAuthorizedGoLink,issueAuthorizedEngagementGoLink,transitionAuthorizedGoLink,revokeAuthorizedEngagementGoLink} from "@/modules/engagement/go-link-lifecycle.server";

type Tx=Parameters<typeof issueAuthorizedGoLink>[0];
type Link=Parameters<typeof transitionAuthorizedGoLink>[3];
const site={id:"site",organizationId:"org"};
const owner={id:"engagement",siteId:site.id,organizationId:site.organizationId};
const actor={actorPersonId:"person",delegationMode:"act"} as AccessContext;
const direct={destination:{kind:"site-page" as const,page:"contact" as const}};
function fixture(){
  let input:Record<string,unknown>={};
  const returning=vi.fn(async()=>[{id:"link",status:"active",...input}]);
  const values=vi.fn((row:Record<string,unknown>)=>{input=row;return {onConflictDoNothing:()=>({returning})};});
  const where=vi.fn(async()=>[]);
  const set=vi.fn(()=>({where}));
  const insert=vi.fn(()=>({values}));
  const update=vi.fn(()=>({set}));
  const tx={insert,update} as unknown as Tx;
  return {tx,returning,values,insert,update,set,where};
}
function link(overrides:Partial<Link>={}):Link{
  return {id:"link",siteId:site.id,organizationId:site.organizationId,engagementVersionId:null,status:"active",...overrides} as Link;
}
describe("canonical Go Link lifecycle",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("uses bounded collision retry for direct and engagement codes, preserving audit distinctions",async()=>{
    const a=fixture();
    a.returning.mockResolvedValueOnce([]);
    const directLink=await issueAuthorizedGoLink(a.tx,actor,site,direct);
    expect(a.values).toHaveBeenCalledTimes(2);
    expect(directLink.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(mocks.audit).toHaveBeenCalledWith(a.tx,actor,expect.objectContaining({action:"site.go_link.create"}));
    const b=fixture();
    b.returning.mockResolvedValueOnce([]);
    const engagement=await issueAuthorizedEngagementGoLink(b.tx,actor,owner,"version","email");
    expect(b.values).toHaveBeenCalledTimes(2);
    expect(engagement.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(b.values).toHaveBeenLastCalledWith(expect.objectContaining({destination:null,engagementVersionId:"version",organizationId:"org",siteId:"site"}));
    expect(mocks.audit).toHaveBeenCalledWith(b.tx,actor,expect.objectContaining({action:"engagement.go_link.create"}));
  });
  it("fails after five collisions without auditing a nonexistent link",async()=>{
    const f=fixture();f.returning.mockResolvedValue([]);
    await expect(issueAuthorizedGoLink(f.tx,actor,site,direct)).rejects.toThrow();
    expect(f.values).toHaveBeenCalledTimes(5);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("preserves platform-owned null scope for engagement links",async()=>{
    const f=fixture();
    await issueAuthorizedEngagementGoLink(f.tx,actor,{id:"engagement",siteId:null,organizationId:null},"version",null);
    expect(f.values).toHaveBeenCalledWith(expect.objectContaining({siteId:null,organizationId:null}));
  });
  it("rejects missing actor and read-only delegation before persistence",async()=>{
    const f=fixture();
    await expect(issueAuthorizedGoLink(f.tx,{...actor,delegationMode:"view"},site,direct)).rejects.toThrow();
    await expect(issueAuthorizedEngagementGoLink(f.tx,{...actor,actorPersonId:null},owner,"version",null)).rejects.toThrow();
    expect(f.insert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects mismatched organization, site, version and resolution mode",async()=>{
    const f=fixture();
    await expect(transitionAuthorizedGoLink(f.tx,actor,site,link({organizationId:"other"}),"revoked")).rejects.toThrow();
    await expect(transitionAuthorizedGoLink(f.tx,actor,site,link({siteId:"other"}),"revoked")).rejects.toThrow();
    await expect(transitionAuthorizedGoLink(f.tx,actor,site,link({engagementVersionId:"version"}),"revoked")).rejects.toThrow();
    await expect(revokeAuthorizedEngagementGoLink(f.tx,actor,owner,link({engagementVersionId:"other"}),"version")).rejects.toThrow();
    await expect(revokeAuthorizedEngagementGoLink(f.tx,actor,owner,link({engagementVersionId:"version",organizationId:"other"}),"version")).rejects.toThrow();
    expect(f.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("makes revocation terminal and repeat revocation a no-op",async()=>{
    const f=fixture();
    await expect(transitionAuthorizedGoLink(f.tx,actor,site,link({status:"revoked"}),"active")).rejects.toThrow();
    expect(await revokeAuthorizedEngagementGoLink(f.tx,actor,owner,link({status:"revoked",engagementVersionId:"version"}),"version")).toEqual({revoked:true});
    expect(f.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("writes exactly one audited state change and preserves engagement revoke-only API",async()=>{
    const f=fixture();
    await transitionAuthorizedGoLink(f.tx,actor,site,link(),"paused");
    expect(f.set).toHaveBeenCalledWith(expect.objectContaining({status:"paused"}));
    expect(mocks.audit).toHaveBeenCalledWith(f.tx,actor,expect.objectContaining({action:"site.go_link.status_change",before:{status:"active"},after:{status:"paused"}}));
    await revokeAuthorizedEngagementGoLink(f.tx,actor,owner,link({engagementVersionId:"version"}),"version");
    expect(f.set).toHaveBeenLastCalledWith(expect.objectContaining({status:"revoked"}));
    expect(mocks.audit).toHaveBeenLastCalledWith(f.tx,actor,expect.objectContaining({action:"engagement.go_link.revoke"}));
  });
});
