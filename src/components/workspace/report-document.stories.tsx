import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {ReportDocumentView,type ReportDocument} from "./report-document";
const report:ReportDocument={version:1,definitionId:"synthetic-impact-review-v1",title:"Community learning impact review",
  asOf:"2026-11-23T00:00:00Z",scopeLabel:"Illustrative internal review",basis:"Synthetic values for design acceptance only; not an approved external publication",
  definitions:[{metricKey:"fixture.registrations",definitionVersion:"1",sourceDomain:"noncredit_pilot",sourceMetricKey:"registrations",label:"Registrations",source:"Synthetic fixture",denominator:"Registration IDs",rule:"One fixture count per registration",timeBasis:"Synthetic cohort",disclosure:"private_operational"}],
  blocks:[
    {id:"metrics",kind:"metrics",items:[{id:"fixture.registrations",label:"Registrations",value:1250,definitionVersion:"1"},{id:"people",label:"Unique participants",value:1080},{id:"hours",label:"Verified participant hours",value:875,format:"hours"},{id:"outcome",label:"Verified outcomes",value:null}]},
    {id:"trend",kind:"chart",metricRefs:[{id:"fixture.registrations",definitionVersion:"1"}],spec:{kind:"trend",title:"Monthly registrations",description:"Synthetic monthly cohort counts; unavailable months are not interpolated.",valueLabel:"Registrations",points:[{id:"jan",label:"January",value:120},{id:"feb",label:"February",value:190},{id:"mar",label:"March",value:null},{id:"apr",label:"April",value:270}]}},
    {id:"sites",kind:"chart",spec:{kind:"comparison",title:"Registrations by Site",description:"Synthetic site counts.",valueLabel:"Registrations",points:[{id:"a",label:"Community learning center",value:750},{id:"b",label:"Independent partner campus",value:500}]}},
    {id:"target",kind:"progress",label:"Participant-hour target",value:875,target:800,format:"hours",description:"Illustrative target, not an approved commitment."},
    {id:"notes",kind:"note",text:"Registrations, distinct people and recorded outcomes have different counting rules. This is a presentation fixture, not verified impact."},
  ]};
const meta={title:"V6.1 templates/Reporting/Impact review",component:ReportDocumentView,args:{report},
  parameters:{chromatic:{viewports:[390,768,1024,1440],modes:{light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"}}}},
  decorators:[Story=><div className="mx-auto max-w-6xl bg-background p-4 sm:p-6"><Story/></div>]} satisfies Meta<typeof ReportDocumentView>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Dashboard:Story={};
export const PrintReview:Story={args:{presentation:"print"},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole("table",{name:"Monthly registrations exact values"})).toBeVisible();
  await expect(canvas.getByRole("table",{name:"Registrations by Site exact values"})).toBeVisible();
  await expect(canvas.getByRole("table",{name:"Community learning impact review metric definitions"})).toBeVisible();
  expect(canvasElement.querySelector("[data-report-chart-plot]")).toBeNull();
}};
