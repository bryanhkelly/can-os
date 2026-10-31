import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
vi.mock("@tanstack/react-router",()=>({Link:({children,to,...props}:any)=>React.createElement("a",{href:to},children),useRouter:()=>({invalidate:vi.fn()})}));
vi.mock("@/modules/programs/launch-year-preparation.functions",()=>({getLaunchAcademicYearPlan:vi.fn(),prepareLaunchAcademicYear:vi.fn()}));
import {ReviewAcademicYear} from "../../src/components/operations/LaunchAcademicYearStep";
const plan={programId:"program",programName:"Hope School",siteId:"site",suggested:{name:"2027–2028 School Year",key:"2027-28",startsOn:"2027-08-23",endsOn:"2028-06-10"},gradeScales:[],years:[],recommendedStructure:"full_year" as const};
describe("launch academic year review",()=>{
 it("shows a prepared proposal and a single save action",()=>{
  const html=renderToStaticMarkup(<ReviewAcademicYear plan={plan}/>);
  expect(html).toContain("Hope School");expect(html).toContain("2027-08-23 through 2028-06-10");
  expect(html).toContain("One full-year term");expect(html).toContain("Standard A–F");
  expect(html).toContain("Save reviewed academic setup");expect(html).toContain("does not authorize school opening");
 });
 it("shows the saved year as a resumable canonical record",()=>{
  const html=renderToStaticMarkup(<ReviewAcademicYear plan={{...plan,years:[{id:"year",name:"Saved School Year",status:"draft",startsOn:"2027-08-23",endsOn:"2028-06-10"}]}}/>);
  expect(html).toContain("Saved School Year");expect(html).toContain("Keep saved grading and terms");
 });
});
