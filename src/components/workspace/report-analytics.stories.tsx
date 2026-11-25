import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {useState} from "react";
import {ReportMetricCard} from "./report-metric-card";
import {ReportTargetAttainment} from "./report-target-attainment";
import {ReportRankedComparison} from "./report-ranked-comparison";
const rows=[{id:"a",label:"Site A",value:200},{id:"b",label:"Site B",value:100},{id:"c",label:"Site C",value:null}];
function AnalyticsFixture(){
  const [selected,setSelected]=useState("");
  const row=rows.find(r=>r.id===selected);
  return <div className="max-w-4xl space-y-4 bg-background p-4 text-foreground">
    <div className="grid gap-3 sm:grid-cols-3">
      <ReportMetricCard item={{id:"hours",label:"Participant hours",value:875.5,format:"hours",prior:700,asOf:"2026-11-23 UTC"}} compare/>
      <ReportMetricCard item={{id:"budget",label:"Recorded expenditure (USD)",value:12950.25,format:"usd",prior:0}} compare/>
      <ReportMetricCard item={{id:"missing",label:"Verified outcomes",value:null}}/>
    </div>
    <ReportTargetAttainment label="Participant-hour target" value={875.5} target={800} format="hours"/>
    <ReportRankedComparison title="Site registrations" description="Synthetic authorized comparison" rows={rows} selectedId={selected} onSelect={setSelected}/>
    <ReportMetricCard item={{id:"selected",label:row?row.label+" registrations":"Choose a Site",value:row?.value??null}}/>
  </div>;
}
const meta={title:"V6.1 foundations/Data Visualization/Analytical components",component:AnalyticsFixture,
  parameters:{chromatic:{viewports:[390,768,1024,1440],modes:{light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"}}}}} satisfies Meta<typeof AnalyticsFixture>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Interactive:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement);
 await expect(canvas.getByText("875.5 h",{exact:true})).toBeVisible();
 await expect(canvas.getByText("109.44% of target achieved (bar capped at 100%)")).toBeVisible();
 await userEvent.click(canvas.getByRole("button",{name:"Filter report to Site B"}));
 await expect(canvas.getByText("Site B registrations")).toBeVisible();
 await expect(canvas.getByRole("button",{name:"Filter report to Site B"})).toHaveAttribute("aria-pressed","true");
}};
export const Dark:Story={globals:{theme:"dark"}};
export const SiteBrand:Story={globals:{theme:"site"}};
