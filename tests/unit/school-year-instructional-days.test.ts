import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({transaction:vi.fn(),audit:vi.fn(),event:vi.fn(),rows:[] as unknown[][],
 generated:[] as any[],existing:new Set<string>()}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/db/schema",()=>Object.fromEntries([
 "academicCalendarDays","academicCalendars","gradeScales","gradingPeriods","programs","scheduleTemplatePeriods","scheduleTemplates","schoolYears","sites","terms",
].map(name=>[name,new Proxy({name},{get:(target,key)=>String(key)})])));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event}));
vi.mock("@/domain/attendance-configuration-lock",()=>({lockAttendanceConfigurationAtSite:vi.fn()}));
vi.mock("@/domain/event-types",()=>({EventTypes:{AcademicCalendarChanged:"calendar"}}));
import {populateSchoolYearInstructionalDays,prepareSchoolYearBasics} from "../../src/modules/academic-time/school-year-service";
const calendar={id:"calendar",organizationId:"org",siteId:"site",programId:"program",startsOn:"2027-08-16",endsOn:"2027-08-20"};
const actor={actorPersonId:"registrar",capabilities:new Set(["academic_year.manage"]),scope:{organizationIds:["org"],siteIds:["site"],programIds:["program"]}};
const input={academicCalendarId:"calendar",weekdays:[1,2,3,4,5],instructionalMinutes:390};
beforeEach(()=>{
 vi.clearAllMocks();state.rows=[[calendar]];state.generated=[];state.existing=new Set();
 const chain:any={from:()=>chain,innerJoin:()=>chain,where:()=>chain,for:()=>chain,limit:async()=>state.rows.shift()??[],
  then:(resolve:any,reject:any)=>Promise.resolve(state.rows.shift()??[]).then(resolve,reject)};
 const tx={select:()=>chain,insert:()=>({values:(rows:any[])=>({onConflictDoNothing:()=>({returning:async()=>{
  state.generated=rows;return rows.filter(row=>!state.existing.has(row.calendarDate)).map((row,index)=>({id:String(index)}));
 }})})})};
 state.transaction.mockImplementation(run=>run(tx));
});
describe("ordinary instructional calendar preparation",()=>{
 it("generates only the reviewed weekdays and minutes",async()=>{
  expect(await populateSchoolYearInstructionalDays(actor,{...input,weekdays:[1,3,5]})).toEqual({processedDays:3,createdDays:3});
  expect(state.generated.map(row=>row.calendarDate)).toEqual(["2027-08-16","2027-08-18","2027-08-20"]);
  expect(state.generated.every(row=>row.type==="instructional"&&row.instructionalMinutes===390)).toBe(true);
 });
 it("uses conflict preservation and reports only actual additions",async()=>{
  state.existing=new Set(["2027-08-17","2027-08-19"]);
  expect(await populateSchoolYearInstructionalDays(actor,input)).toEqual({processedDays:5,createdDays:3});
  expect(state.event).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({payload:expect.objectContaining({scheduledDays:3})}));
 });
 it("does not emit another mutation event when all days already exist",async()=>{
  state.existing=new Set(["2027-08-16","2027-08-17","2027-08-18","2027-08-19","2027-08-20"]);
  expect(await populateSchoolYearInstructionalDays(actor,input)).toEqual({processedDays:5,createdDays:0});
  expect(state.audit).not.toHaveBeenCalled();expect(state.event).not.toHaveBeenCalled();
 });
 it("runs calendar generation in the same preparation transaction",async()=>{
  const year={...calendar,id:"year",status:"draft"};
  state.rows=[[year],[year],[{id:"term",name:"Full year",startsOn:year.startsOn,endsOn:year.endsOn}],[{id:"period"}],[{id:"calendar"}],[calendar]];
  await prepareSchoolYearBasics(actor,{schoolYearId:"year",structure:"full_year",instructionalDays:{weekdays:[1,2,3,4,5],instructionalMinutes:390}});
  expect(state.transaction).toHaveBeenCalledTimes(1);expect(state.generated).toHaveLength(5);
 });
 it("denies another Site's calendar",async()=>{
  state.rows=[[{...calendar,siteId:"other"}]];
  await expect(populateSchoolYearInstructionalDays(actor,input)).rejects.toThrow();
  expect(state.generated).toHaveLength(0);expect(state.event).not.toHaveBeenCalled();
 });
 it("requires meaningful instructional settings before starting a transaction",async()=>{
  await expect(populateSchoolYearInstructionalDays(actor,{...input,weekdays:[]})).rejects.toThrow("Review instructional");
  await expect(populateSchoolYearInstructionalDays(actor,{...input,instructionalMinutes:0})).rejects.toThrow("Review instructional");
  expect(state.transaction).not.toHaveBeenCalled();
 });
});
