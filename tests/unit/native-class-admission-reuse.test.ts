import {describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({event:vi.fn()}));
vi.mock("@/platform/canonical-mutation.server",()=>({emitCanonicalDomainEvent:mocks.event}));
vi.mock("drizzle-orm",()=>({and:vi.fn(),desc:vi.fn(),eq:vi.fn(),gt:vi.fn(),inArray:vi.fn(),isNull:vi.fn(),lte:vi.fn(),or:vi.fn()}));
vi.mock("@/db/canonical-v301",()=>({
 canonicalClassEnrollments:{id:"id",status:"status",creditMode:"credit",courseAttemptId:"attempt",classId:"class",learnerPersonId:"learner",enrolledAt:"date"},
 canonicalClassEnrollmentRepeatAuthorizations:{id:"id",classId:"class",learnerPersonId:"learner",priorEnrollmentId:"prior",consumedByEnrollmentId:"consumed",expiresAt:"expires"},
 networkMemberships:{id:"id",memberOrganizationId:"member",status:"status",directoryVisible:"visible",networkOrganizationId:"network",validFrom:"from",validThrough:"through"},
 participationAttributions:{id:"id"},
}));
import {readOpenNativeClassEnrollment,readLatestCompletedNativeClassEnrollment} from "@/modules/classes/native-class-enrollment-history.server";
import {consumeNativeClassRepeatAuthorization} from "@/modules/classes/native-class-repeat-consumption.server";
import {writeNativeClassAttribution} from "@/modules/classes/native-class-attribution.server";
import {eq,inArray,desc} from "drizzle-orm";

type Tx=Parameters<typeof writeNativeClassAttribution>[0];
function fixture(rows:Record<string,unknown>[]=[],updated:Record<string,unknown>[]=[{id:"authorization"}]){
 const limit=vi.fn(async()=>rows);
 const orderBy=vi.fn(()=>({limit}));
 const where=vi.fn(()=>({limit,orderBy,returning:async()=>updated}));
 const select=vi.fn(()=>({from:()=>({where})}));
 const set=vi.fn(()=>({where}));
 const update=vi.fn(()=>({set}));
 const values=vi.fn(async()=>[]);
 const insert=vi.fn(()=>({values}));
 return {tx:{select,insert,update} as unknown as Tx,select,limit,orderBy,set,update,values,insert};
}
const input={authorizationId:"authorization",classId:"class-a",learnerPersonId:"person",priorEnrollmentId:"prior",classEnrollmentId:"enrollment",courseAttemptId:"attempt",actorPersonId:"guardian"};
const source={classId:"class-a",siteId:"site-a",operatingOrganizationId:"provider"};
const now=new Date("2026-11-24T00:00:00Z");
describe("shared native Class admission services",()=>{
 it("checks exact Class and Person and rejects duplicate open participation",async()=>{
  const f=fixture([{id:"one"},{id:"two"}]);
  await expect(readOpenNativeClassEnrollment(f.tx,"class-a","person")).rejects.toThrow("duplicate open Class enrollments");
  expect(eq).toHaveBeenCalledWith("class","class-a");
  expect(eq).toHaveBeenCalledWith("learner","person");
  expect(inArray).toHaveBeenCalledWith("status",["pending","active"]);
  expect(f.limit).toHaveBeenCalledWith(2);
 });
 it("returns an existing open enrollment without changing it",async()=>{
  const row={id:"open",status:"active",courseAttemptId:"attempt"};
  const f=fixture([row]);
  expect(await readOpenNativeClassEnrollment(f.tx,"class-a","person")).toEqual(row);
  expect(f.update).not.toHaveBeenCalled();
 });
 it("selects latest completed history with a deterministic tie breaker",async()=>{
  const f=fixture([{id:"prior"}]);
  expect(await readLatestCompletedNativeClassEnrollment(f.tx,"class-a","person")).toEqual({id:"prior"});
  expect(eq).toHaveBeenCalledWith("status","completed");
  expect(desc).toHaveBeenCalledWith("date");
  expect(desc).toHaveBeenCalledWith("id");
  expect(f.limit).toHaveBeenCalledWith(1);
 });
 it("emits repeat consumption only after conditional update succeeds",async()=>{
  mocks.event.mockClear();
  const f=fixture();
  await consumeNativeClassRepeatAuthorization(f.tx,input);
  expect(f.set).toHaveBeenCalledWith({consumedByEnrollmentId:"enrollment"});
  expect(mocks.event).toHaveBeenCalledWith(f.tx,expect.objectContaining({eventType:"ClassRepeatAuthorizationConsumed",actorPersonId:"guardian",payload:{classId:"class-a",priorEnrollmentId:"prior",classEnrollmentId:"enrollment",courseAttemptId:"attempt"}}));
  mocks.event.mockClear();
  await expect(consumeNativeClassRepeatAuthorization(fixture([],[]).tx,input)).rejects.toThrow();
  expect(mocks.event).not.toHaveBeenCalled();
 });
 it("uses provider-default attribution without a directory lookup",async()=>{
  const f=fixture();
  await writeNativeClassAttribution(f.tx,{source,now,enrollmentId:"enrollment"});
  expect(f.select).not.toHaveBeenCalled();
  expect(f.values).toHaveBeenCalledWith({classEnrollmentId:"enrollment",deliverySiteId:"site-a",reportingSiteId:"site-a",creditedOrganizationId:"provider",networkMembershipId:null,attributionBasis:"provider_default",relationshipSnapshot:{kind:"provider_default",classId:"class-a",organizationId:"provider",siteId:"site-a"}});
 });
 it("preserves approved affiliate attribution and rejects unavailable affiliates",async()=>{
  const f=fixture([{id:"membership",memberOrganizationId:"affiliate"}]);
  await writeNativeClassAttribution(f.tx,{source,now,enrollmentId:"enrollment",networkMembershipId:"membership"});
  expect(eq).toHaveBeenCalledWith("network","provider");
  expect(eq).toHaveBeenCalledWith("status","approved");
  expect(eq).toHaveBeenCalledWith("visible",true);
  expect(f.values).toHaveBeenCalledWith(expect.objectContaining({creditedOrganizationId:"affiliate",networkMembershipId:"membership",attributionBasis:"self_reported",relationshipSnapshot:{}}));
  const rejected=fixture();
  await expect(writeNativeClassAttribution(rejected.tx,{source,now,enrollmentId:"enrollment",networkMembershipId:"unknown"})).rejects.toThrow();
  expect(rejected.insert).not.toHaveBeenCalled();
 });
 it("rejects missing authorized delivery Site",async()=>{
  const f=fixture();
  await expect(writeNativeClassAttribution(f.tx,{source:{...source,siteId:null},now,enrollmentId:"enrollment"})).rejects.toThrow();
  expect(f.insert).not.toHaveBeenCalled();
 });
});
