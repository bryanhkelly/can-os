import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({rows:[] as any[],actor:{} as any,requireActor:vi.fn(),create:vi.fn(),prepare:vi.fn(),scale:vi.fn()}));
vi.mock("@/db/client",()=>({db:{select:()=>{const chain:any={from:()=>chain,where:()=>chain,limit:async()=>state.rows.shift()??[],then:(resolve:any,reject:any)=>Promise.resolve(state.rows.shift()??[]).then(resolve,reject)};return chain;}}}));
vi.mock("@/db/schema",()=>Object.fromEntries(["gradeScales","programs","schoolYears","sites"].map(name=>[name,new Proxy({name},{get:(t,key)=>String(key)})])));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler:(handler:unknown)=>handler})}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/actors.server",()=>({requireActor:state.requireActor}));
vi.mock("@/modules/academic-time/school-year-service",()=>({createSchoolYear:state.create,prepareSchoolYearBasics:state.prepare}));
vi.mock("@/modules/academic-time/standard-grade-scale.server",()=>({ensureStandardGradeScale:state.scale}));
import {getLaunchAcademicYearPlan,prepareLaunchAcademicYear} from "../../src/modules/programs/launch-year-preparation.functions";
const program={id:"program",name:"School",organizationId:"org",siteId:"site",status:"launching",metadata:{targetOpeningDate:"2027-08-23"},gradeRange:{min:"K",max:"8"}};
const input={programId:"program",structure:"full_year" as const,instructionalDays:{weekdays:[1,2,3,4,5],instructionalMinutes:360},useStandardGradeScale:true};
beforeEach(()=>{
 vi.clearAllMocks();state.rows=[];state.actor={actorPersonId:"registrar",scope:{organizationIds:["org"],siteIds:["site"],programIds:["program"]}};
 state.requireActor.mockImplementation(async()=>state.actor);state.create.mockResolvedValue("year");state.scale.mockResolvedValue("scale");state.prepare.mockResolvedValue({schoolYearId:"year",calendarId:"calendar",existingStructure:false});
});
describe("academic preparation in the saved school launch",()=>{
 it("proposes saved dates and a full-year elementary structure without writing",async()=>{
  state.rows=[[program],[],[]];
  expect(await getLaunchAcademicYearPlan({data:{programId:"program"}})).toMatchObject({programId:"program",siteId:"site",suggested:{startsOn:"2027-08-23"},recommendedStructure:"full_year"});
  expect(state.create).not.toHaveBeenCalled();
 });
 it("creates canonical records using the reviewed settings",async()=>{
  state.rows=[[program],[{organizationId:"org",timezone:"America/Los_Angeles"}],[],[]];
  expect(await prepareLaunchAcademicYear({data:input})).toMatchObject({schoolYearId:"year",status:"draft"});
  expect(state.create).toHaveBeenCalledWith(state.actor,expect.objectContaining({programId:"program",siteId:"site",startsOn:"2027-08-23",gradeScaleId:"scale"}));
  expect(state.prepare).toHaveBeenCalledWith(state.actor,{schoolYearId:"year",structure:"full_year",instructionalDays:input.instructionalDays});
 });
 it("resumes a partially prepared year without creating another scale or year",async()=>{
  state.rows=[[program],[{organizationId:"org",timezone:"UTC"}],[{id:"year",status:"draft"}]];
  await prepareLaunchAcademicYear({data:{...input,schoolYearId:"year"}});
  expect(state.create).not.toHaveBeenCalled();expect(state.scale).not.toHaveBeenCalled();expect(state.prepare).toHaveBeenCalledTimes(1);
 });
 it("uses an active saved year without rewriting it",async()=>{
  state.rows=[[program],[{organizationId:"org",timezone:"UTC"}],[{id:"year",status:"active"}]];
  expect(await prepareLaunchAcademicYear({data:{...input,schoolYearId:"year"}})).toMatchObject({status:"active",reused:true});
  expect(state.prepare).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
 });
 it("requires a choice between multiple existing years",async()=>{
  state.rows=[[program],[{organizationId:"org",timezone:"UTC"}],[{id:"a",status:"draft"},{id:"b",status:"draft"}]];
  await expect(prepareLaunchAcademicYear({data:input})).rejects.toThrow("Choose which existing");
  expect(state.create).not.toHaveBeenCalled();
 });
 it("denies a requested year outside the selected school",async()=>{
  state.rows=[[program],[{organizationId:"org",timezone:"UTC"}],[]];
  await expect(prepareLaunchAcademicYear({data:{...input,schoolYearId:"other"}})).rejects.toThrow("selected school year");
  expect(state.prepare).not.toHaveBeenCalled();
 });
 it("denies another Site before preparing anything",async()=>{
  state.actor.scope.siteIds=["other"];state.rows=[[program]];
  await expect(prepareLaunchAcademicYear({data:input})).rejects.toThrow("launch and site scope");
  expect(state.scale).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
 });
});
