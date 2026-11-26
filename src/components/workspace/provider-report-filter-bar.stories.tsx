import type {Meta,StoryObj} from "@storybook/react-vite";
import {useState} from "react";
import {expect,within,userEvent} from "storybook/test";
import {ProviderReportFilterBar} from "./provider-report-filter-bar";
import {reportSiteSelectionAvailable} from "@/domain/report-filter-state";
import {ProviderReportFilterProvider,useProviderReportFilters} from "@/hooks/use-provider-report-filters";
import {hasGeographyFilterOption} from "@/domain/geographic-reporting";
import {Button} from "@/components/ui/button";
function FilterFixture({scope,historical}:{scope:string;historical:boolean}){
 const {filters,dispatch}=useProviderReportFilters(scope);
 const geography=[{code:"US-GA",name:"Georgia",kind:"state" as const},...(!historical?[{code:"US-CBSA-12060",name:"Atlanta Metro",kind:"metro" as const}]:[])];
 const sites=scope==="fixture-a"?[{id:"site-a",label:"Site A"},{id:"site-b",label:"Site B"}]:[{id:"site-c",label:"Site C"}];
 const ready=hasGeographyFilterOption(filters.geography,geography)&&reportSiteSelectionAvailable(filters.siteId,sites);
 return <div className="space-y-3">
   <ProviderReportFilterBar filters={filters} dispatch={dispatch}
     basis={historical?"historical":"current"} geography={{data:geography,loading:false,error:false}} sites={{data:sites,loading:false,error:false}}
     ready={ready} pending={false} onRetry={()=>{}}/>
   {historical&&<><Button type="button" variant="outline" onClick={()=>dispatch({type:"closed",range:{fromDay:"2026-11-01",untilDay:"2026-11-15"}})}>Use fixture closed period</Button>
     <p>{filters.outcomePeriod.mode==="closed"?filters.outcomePeriod.range.fromDay+" to "+filters.outcomePeriod.range.untilDay:"Rolling period"}</p></>}
   {ready&&<p>Matching authorized results</p>}
 </div>;
}
function Fixture(){
 const [historical,setHistorical]=useState(false);
 const [scope,setScope]=useState("fixture-a");
 return <div className="space-y-3 p-4">
   <Button type="button" variant="outline" onClick={()=>setHistorical(v=>!v)}>{historical?"Show delivery":"Show learning outcomes"}</Button>
   <Button type="button" variant="outline" onClick={()=>setScope(v=>v==="fixture-a"?"fixture-b":"fixture-a")}>Switch verified scope</Button>
   <ProviderReportFilterProvider key={scope} scope={scope}>
     <FilterFixture key={historical?"historical":"current"} scope={scope} historical={historical}/>
   </ProviderReportFilterProvider>
 </div>;
}
const meta={title:"V6.1 foundations/Data Visualization/Provider report filters",component:Fixture,
 parameters:{chromatic:{modes:{light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"}}}}} satisfies Meta<typeof Fixture>;
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
 await userEvent.click(canvas.getByRole("button",{name:/^Clear geography$/}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("site-a");
 await userEvent.click(canvas.getByRole("button",{name:/^Clear Site$/}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("");
}};
export const Dark:Story={globals:{theme:"dark"}};
export const SiteBrand:Story={globals:{theme:"site"}};

/** Exercises the production context, not a duplicate state model. */
export const ScopeIsolation:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement);
 await userEvent.selectOptions(canvas.getByRole("combobox",{name:"Delivery Site"}),"site-a");
 await userEvent.click(canvas.getByRole("button",{name:"Show learning outcomes"}));
 await userEvent.click(canvas.getByRole("button",{name:"Use fixture closed period"}));
 await userEvent.click(canvas.getByRole("button",{name:"Show delivery"}));
 await userEvent.click(canvas.getByRole("button",{name:"Show learning outcomes"}));
 await expect(canvas.getByText("2026-11-01 to 2026-11-15")).toBeVisible();
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("site-a");
 await userEvent.click(canvas.getByRole("button",{name:"Switch verified scope"}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("");
 await expect(canvas.getByText("Rolling period")).toBeVisible();
 await userEvent.click(canvas.getByRole("button",{name:"Switch verified scope"}));
 await expect(canvas.getByRole("combobox",{name:"Delivery Site"})).toHaveValue("");
 await expect(canvas.getByText("Rolling period")).toBeVisible();
}};
