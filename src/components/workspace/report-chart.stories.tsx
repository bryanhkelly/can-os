import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ReportChart } from "./report-chart";
import type {ReportChartSpec} from "./report-chart-data";
const fixture={title:"Pilot participation",description:"Synthetic fixture only. Counts overlap.",valueLabel:"Registrations",kind:"comparison",format:"count",points:[{id:"registered",label:"Registered",value:102},{id:"engaged",label:"Engaged",value:87},{id:"completed",label:"Completed",value:69}]} satisfies ReportChartSpec;
const meta = {
  title:"Foundations/V6.1 reporting charts", component:ReportChart,
  parameters:{chromatic:{modes:{light:{theme:"light"},dark:{theme:"dark"}}}},
  args:{spec:fixture as ReportChartSpec},
} satisfies Meta<typeof ReportChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole("table",{name:"Pilot participation exact values"})).toBeVisible();
  await expect(canvas.getByRole("rowheader",{name:"Completed"})).toBeVisible();
  await expect(canvas.getByText("69",{exact:true})).toBeVisible();
}};
export const Trend: Story = {args:{spec:{...fixture,title:"Monthly participation",kind:"trend",
  points:[{id:"jan",label:"Jan",value:12},{id:"feb",label:"Feb",value:null},{id:"mar",label:"Mar",value:23}]}}};
export const Missing: Story = {args:{spec:{...fixture,points:[{id:"missing",label:"Not measured",value:null}]}},
  play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByText("Unavailable",{exact:true})).toBeVisible();}};
export const Zero: Story = {args:{spec:{...fixture,points:[{id:"zero",label:"Registered",value:0}]}}};
export const Mobile: Story = {parameters:{chromatic:{viewports:[390]}},render:args=><div className="max-w-[390px]"><ReportChart {...args}/></div>};
export const Dark: Story = {globals:{theme:"dark"},parameters:{chromatic:{viewports:[390,1440]}}};

export const Distribution: Story={args:{spec:{title:"Receipt mix",description:"Synthetic mutually exclusive fixture.",valueLabel:"Events",
  kind:"distribution",format:"count",population:"100 eligible events",total:100,
  points:[{id:"a",label:"Accepted",value:80},{id:"b",label:"Pending",value:15},{id:"c",label:"Failed",value:5}]}}};
export const Stacked: Story={args:{spec:{title:"Receipt states by source",description:"Synthetic disjoint groups.",valueLabel:"Events",
  kind:"stacked",format:"count",population:"Eligible events per source",series:[{id:"a",label:"Accepted"},{id:"b",label:"Pending"}],
  rows:[{id:"x",label:"Source A",total:50,values:[42,8]},{id:"y",label:"Source B",total:20,values:[18,2]}]}},
  play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByRole("columnheader",{name:"Accepted"})).toBeVisible();await expect(canvas.getByText("42",{exact:true})).toBeVisible();}};
export const Funnel: Story={args:{spec:{title:"Nested cohort",description:"Synthetic fixture with verified nesting; no implied causal attribution.",valueLabel:"Registrations",
  kind:"funnel",format:"count",population:"Same registration cohort",nestedCohort:true,
  points:[{id:"a",label:"Eligible",value:100},{id:"b",label:"Started",value:70},{id:"c",label:"Completed",value:40}]}}};
