import type {Meta,StoryObj} from "@storybook/react-vite";
import {useState} from "react";
import {expect,within,userEvent} from "storybook/test";
import {ProviderReportFilterBar} from "./provider-report-filter-bar";
import {initialProviderReportFilters,updateProviderReportFilters,reportSiteSelectionAvailable} from "@/domain/report-filter-state";
import {hasGeographyFilterOption} from "@/domain/geographic-reporting";
import {Button} from "@/components/ui/button";
function Fixture(){
 const [filters,setFilters]=useState(()=>initialProviderReportFilters(new Date("2026-11-24T12:00:00Z")));
 const [historical,setHistorical]=useState(false);
 const geography=[{code:"US-GA",name:"Georgia",kind:"state" as const},...(!historical?[{code:"US-CBSA-12060",name:"Atlanta Metro",kind:"metro" as const}]:[])];
 const sites=[{id:"site-a",label:"Site A"},{id:"site-b",label:"Site B"}];
 const ready=hasGeographyFilterOption(filters.geography,geography)&&reportSiteSelectionAvailable(filters.siteId,sites);
 return <div className="space-y-3 p-4">
   <Button type="button" variant="outline" onClick={()=>setHistorical(v=>!v)}>{historical?"Show delivery":"Show learning outcomes"}</Button>
   <ProviderReportFilterBar filters={filters} dispatch={action=>setFilters(prior=>updateProviderReportFilters(prior,action))}
     basis={historical?"historical":"current"} geography={{data:geography,loading:false,error:false}} sites={{data:sites,loading:false,error:false}}
     ready={ready} pending={false} onRetry={()=>{}}/>
   {ready&&<p>Matching authorized results</p>}
 </div>;
}
const meta={title:"V6.1 foundations/Data Visualization/Provider report filters",component:Fixture,
 parameters:{chromatic:{viewports:[390,768,1024,1440],modes:{light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"}}}} satisfies Meta<typeof Fixture>;
export default meta;
type Story=StoryObj<typeof meta>;
export const CrossReportSelection:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement);
 await userEvent.selectOptions(canvas.getByRole("combobox",{name:"Delivery Site"}),"site-a");
 await userEvent.selectOptions(canvas.getByRole("combobox",{name:"Delivery geography"}),"US-CBSA-12060");
 await userEvent.click(canvas.getByRole("button",{name:"Show learning outcomes"}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("site-a");
 await expect(canvas.queryByText("Matching authorized results")).not.toBeInTheDocument();
 await expect(canvas.getByText("Selected geography unavailable",{exact:true})).toBeInTheDocument();
 await userEvent.selectOptions(canvas.getByRole("combobox",{name:"Delivery geography"}),"US-GA");
 await expect(canvas.getByText("Matching authorized results")).toBeVisible();
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("site-a");
 await userEvent.click(canvas.getByRole("button",{name:"Clear geography",exact:true}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("site-a");
 await userEvent.click(canvas.getByRole("button",{name:"Clear Site",exact:true}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("");
}};
export const Dark:Story={globals:{theme:"dark"}};
export const SiteBrand:Story={globals:{theme:"site"}};
