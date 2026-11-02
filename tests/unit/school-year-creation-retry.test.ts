import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({transaction:vi.fn(),insert:vi.fn(),audit:vi.fn(),event:vi.fn(),execute:vi.fn(),rows:[] as any[]}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/db/schema",()=>Object.fromEntries([
 "academicCalendarDays","academicCalendars","gradeScales","gradingPeriods","programs","scheduleTemplatePeriods","scheduleTemplates","schoolYears","sites","terms",
].map(name=>[name,new Proxy({name},{get:(target,key)=>String(key)})])));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event}));
vi.mock("@/domain/attendance-configuration-lock",()=>({lockAttendanceConfigurationAtSite:vi.fn()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{SchoolYearCreated:"year"}}));
import {createSchoolYear} from "../../src/modules/academic-time/school-year-service";
const input={organizationId:"org",siteId:"site",programId:"program",key:"2027-28",name:"School year",
 startsOn:"2027-08-15",endsOn:"2028-06-10",gradeScaleId:"scale",timezone:"America/Los_Angeles"};
const actor={actorPersonId:"registrar",capabilities:new Set(["academic_year.manage"]),scope:{organizationIds:["org"],siteIds:["site"],programIds:["program"]}};
const scale={id:"scale",organizationId:"org",active:true};
beforeEach(()=>{
 vi.clearAllMocks();state.rows=[];
 const chain:any={from:()=>chain,where:()=>chain,for:()=>chain,limit:async()=>state.rows.shift()??[]};
 state.insert.mockReturnValue({values:()=>({returning:async()=>[{id:"year"}]})});
 state.transaction.mockImplementation(run=>run({select:()=>chain,insert:state.insert,execute:state.execute}));
});
describe("canonical school-year creation retries",()=>{
 it("reuses an exact year without duplicate audit or creation events",async()=>{
  state.rows=[[{organizationId:"org"}],[scale],[{organizationId:"org",siteId:"site"}],[{id:"year",...input}]];
  expect(await createSchoolYear(actor,input)).toBe("year");
  expect(state.execute).toHaveBeenCalledTimes(1);
  expect(state.insert).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();expect(state.event).not.toHaveBeenCalled();
 });
 it("reuses a Site-wide year despite nullable Program uniqueness",async()=>{
  state.rows=[[{organizationId:"org"}],[scale],[{id:"year",...input,programId:null}]];
  expect(await createSchoolYear(actor,{...input,programId:undefined})).toBe("year");
  expect(state.insert).not.toHaveBeenCalled();
 });
 it("rejects a conflicting proposal without overwriting the year",async()=>{
  state.rows=[[{organizationId:"org"}],[scale],[{organizationId:"org",siteId:"site"}],[{id:"year",...input,name:"Different year"}]];
  await expect(createSchoolYear(actor,input)).rejects.toThrow("different settings");
  expect(state.insert).not.toHaveBeenCalled();
 });
 it("creates one new year with the existing audit and event contract",async()=>{
  state.rows=[[{organizationId:"org"}],[scale],[{organizationId:"org",siteId:"site"}],[]];
  expect(await createSchoolYear(actor,input)).toBe("year");
  expect(state.insert).toHaveBeenCalledTimes(1);expect(state.audit).toHaveBeenCalledTimes(1);expect(state.event).toHaveBeenCalledTimes(1);
 });
 it("denies a Program belonging to a sibling Site",async()=>{
  state.rows=[[{organizationId:"org"}],[scale],[{organizationId:"org",siteId:"other"}]];
  await expect(createSchoolYear(actor,input)).rejects.toThrow("SchoolYear Site");expect(state.insert).not.toHaveBeenCalled();
 });
 it("denies a Site belonging to another organization",async()=>{
  state.rows=[[{organizationId:"other"}]];
  await expect(createSchoolYear(actor,input)).rejects.toThrow("Site must belong");expect(state.insert).not.toHaveBeenCalled();
 });
 it("rechecks current capability before a retry can return a record",async()=>{
  await expect(createSchoolYear({...actor,capabilities:new Set()},input)).rejects.toThrow();
  expect(state.transaction).not.toHaveBeenCalled();
 });
});
