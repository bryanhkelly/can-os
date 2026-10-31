import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({rows:[] as unknown[][],inserts:[] as string[],transaction:vi.fn(),audit:vi.fn(),event:vi.fn()}));
vi.mock("@/db/schema",()=>Object.fromEntries([
 "academicCalendarDays","academicCalendars","gradeScales","gradingPeriods","programs","scheduleTemplatePeriods","scheduleTemplates","schoolYears","terms",
].map(name=>[name,new Proxy({name},{get:(target,key)=>key==="name"?target.name:String(key)})])));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event}));
vi.mock("@/domain/attendance-configuration-lock",()=>({lockAttendanceConfigurationAtSite:vi.fn()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{TermCreated:"term",GradingPeriodCreated:"period",AcademicCalendarChanged:"calendar"}}));
import {prepareSchoolYearBasics} from "../../src/modules/academic-time/school-year-service";

const year={id:"year",organizationId:"org",siteId:"site",programId:"program",status:"draft",startsOn:"2027-08-15",endsOn:"2028-06-10"};
const actor={actorPersonId:"registrar",capabilities:new Set(["academic_year.manage"]),scope:{organizationIds:["org"],siteIds:["site"],programIds:["program"]}};
const term={id:"term",name:"Full-year term",startsOn:year.startsOn,endsOn:year.endsOn};
beforeEach(()=>{
 state.rows=[];state.inserts=[];vi.clearAllMocks();
 const tx={
  select:()=>{
   const query:any={from:()=>query,where:()=>query,innerJoin:()=>query,for:()=>query,
    limit:()=>Promise.resolve(state.rows.shift()??[]),
    then:(resolve:any,reject:any)=>Promise.resolve(state.rows.shift()??[]).then(resolve,reject)};
   return query;
  },
  insert:(table:{name:string})=>({values:()=>{
   state.inserts.push(table.name);
   return {returning:async()=>[{id:table.name==="terms"?"term":table.name==="gradingPeriods"?"period":"calendar"}]};
  }}),
 };
 state.transaction.mockImplementation((run:any)=>run(tx));
});
describe("canonical school-year preparation",()=>{
 it("uses one transaction and the canonical term, period and calendar commands",async()=>{
  state.rows=[[year],[year],[],[year],[],[],[{...year,termId:"term",termStartsOn:year.startsOn,termEndsOn:year.endsOn}],[],[year]];
  expect(await prepareSchoolYearBasics(actor,{schoolYearId:"year",structure:"full_year"}))
   .toEqual({schoolYearId:"year",calendarId:"calendar",existingStructure:false});
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.inserts).toEqual(["terms","gradingPeriods","academicCalendars"]);
  expect(state.audit).toHaveBeenCalledTimes(3);
  expect(state.event).toHaveBeenCalledTimes(3);
 });
 it("reuses existing records on retry without overwrites or duplicate events",async()=>{
  state.rows=[[year],[year],[term],[{id:"period"}],[{id:"calendar"}]];
  expect(await prepareSchoolYearBasics(actor,{schoolYearId:"year",structure:"semesters"}))
   .toEqual({schoolYearId:"year",calendarId:"calendar",existingStructure:true});
  expect(state.inserts).toEqual([]);expect(state.event).not.toHaveBeenCalled();
 });
 it("denies callers without academic setup permission",async()=>{
  await expect(prepareSchoolYearBasics({...actor,capabilities:new Set()},{schoolYearId:"year",structure:"full_year"})).rejects.toThrow();
  expect(state.transaction).not.toHaveBeenCalled();
 });
 it.each([{siteId:"other"},{organizationId:"other"},{programId:"other"}])("denies a year outside the verified scope",async change=>{
  state.rows=[[{...year,...change}]];
  await expect(prepareSchoolYearBasics(actor,{schoolYearId:"year",structure:"full_year"})).rejects.toThrow();
  expect(state.inserts).toEqual([]);
 });
 it("does not alter an active year's academic structure",async()=>{
  state.rows=[[year],[{...year,status:"active"}]];
  await expect(prepareSchoolYearBasics(actor,{schoolYearId:"year",structure:"full_year"})).rejects.toThrow("draft school year");
  expect(state.inserts).toEqual([]);
 });
});
