import {chromaticWidthModes} from "../../../.storybook/viewports";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, waitFor } from "storybook/test";
import { ReportChart } from "./report-chart";
import type {ReportChartSpec} from "./report-chart-data";
const fixture={title:"Pilot participation",description:"Synthetic fixture only. Counts overlap.",valueLabel:"Registrations",kind:"comparison",format:"count",points:[{id:"registered",label:"Registered",value:102},{id:"engaged",label:"Engaged",value:87},{id:"completed",label:"Completed",value:69}]} satisfies ReportChartSpec;
const meta = {
  id: "v6-1-foundations-data-visualization-charts", title: "03 Components/Reporting/Charts", component:ReportChart,
  parameters:{chromatic:{modes:{light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"}}}},
  args:{spec:fixture as ReportChartSpec},
} satisfies Meta<typeof ReportChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole("table",{name:"Pilot participation exact values"})).toBeVisible();
  await expect(canvas.getByRole("rowheader",{name:"Completed"})).toBeVisible();
  await expect(within(canvas.getByRole("table",{name:"Pilot participation exact values"})).getByText("69",{exact:true})).toBeVisible();
  await waitFor(()=>expect(canvasElement.querySelector("[data-report-chart-plot] .recharts-surface")).not.toBeNull());
}};
export const Trend: Story = {args:{spec:{...fixture,title:"Monthly participation",kind:"trend",
  points:[{id:"jan",label:"Jan",value:12},{id:"feb",label:"Feb",value:null},{id:"mar",label:"Mar",value:23}]}}};
export const Missing: Story = {args:{spec:{...fixture,points:[{id:"missing",label:"Not measured",value:null}]}},
  play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByText("Unavailable",{exact:true})).toBeVisible();}};
export const Zero: Story = {args:{spec:{...fixture,points:[{id:"zero",label:"Registered",value:0}]}},play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByText("All reported values are zero")).toBeVisible();await expect(canvas.getByText("0",{exact:true})).toBeVisible();}};
export const Mobile: Story = {parameters:{chromatic:{modes: chromaticWidthModes([390])}},render:args=><div className="w-full max-w-[390px] p-3"><ReportChart {...args}/></div>,play:async({canvasElement})=>{await waitFor(()=>expect(canvasElement.querySelector(".recharts-surface")).not.toBeNull());const panel=canvasElement.querySelector("[data-report-chart]")!;expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth+1);}};
export const Dark: Story = {globals:{theme:"dark"},parameters:{chromatic:{modes: chromaticWidthModes([390,1440])}}};

export const Distribution: Story={args:{spec:{title:"Receipt mix",description:"Synthetic mutually exclusive fixture.",valueLabel:"Events",
  kind:"distribution",format:"count",population:"100 eligible events",total:100,seriesOrder:["a","b","c","d"],
  points:[{id:"a",label:"Accepted",value:80},{id:"b",label:"Pending",value:15},{id:"c",label:"Failed",value:5}]}}};
export const Stacked: Story={args:{spec:{title:"Receipt states by source",description:"Synthetic disjoint groups.",valueLabel:"Events",
  kind:"stacked",format:"count",population:"Eligible events per source",seriesOrder:["a","b","c","d"],series:[{id:"a",label:"Accepted"},{id:"b",label:"Pending"}],
  rows:[{id:"x",label:"Source A",total:50,values:[42,8]},{id:"y",label:"Source B",total:20,values:[18,2]}]}},
  play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByRole("columnheader",{name:"Accepted"})).toBeVisible();await expect(within(canvas.getByRole("table",{name:"Receipt states by source exact values"})).getByText("42",{exact:true})).toBeVisible();}};
export const Funnel: Story={args:{spec:{title:"Nested cohort",description:"Synthetic fixture with verified nesting; no implied causal attribution.",valueLabel:"Registrations",
  kind:"funnel",format:"count",population:"Same registration cohort",nestedCohort:true,
  points:[{id:"a",label:"Eligible",value:100},{id:"b",label:"Started",value:70},{id:"c",label:"Completed",value:40}]}}};

export const SiteBrand:Story={globals:{theme:"site"}};
export const Empty:Story={args:{spec:{...fixture,points:[]}}};
export const Invalid:Story={args:{spec:{...fixture,points:[{id:"invalid",label:"Invalid source count",value:-1}]}},play:async({canvasElement})=>{await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Invalid or unbounded chart data");}};
export const LongLabelsAndLargeValues:Story={args:{spec:{...fixture,points:[
  {id:"long-1",label:"Greater metropolitan community learning and youth opportunity center",value:12500000},
  {id:"long-2",label:"Greater metropolitan community learning and youth opportunity center",value:2090000},
  {id:"long-3",label:"Regional independent workforce training partner",value:null},
]}},render:args=><div className="w-full max-w-[390px] p-3"><ReportChart {...args}/></div>,play:async({canvasElement})=>{
  await expect(within(canvasElement).getAllByRole("rowheader",{name:"Greater metropolitan community learning and youth opportunity center"})).toHaveLength(2);
  await expect(within(canvasElement).getByText("12,500,000",{exact:true})).toBeVisible();
}};
export const Dense:Story={args:{spec:{...fixture,points:Array.from({length:30},(_,i)=>({id:String(i),label:"Delivery Site "+(i+1),value:(i+1)*13}))}}};
const categoricalFixture={title:"Delivery pathways",description:"Synthetic partition; each series has a different non-color texture.",valueLabel:"Registrations",kind:"stacked",format:"count",population:"One disjoint group per Site",seriesOrder:["a","b","c","d"],
  series:[{id:"a",label:"Pathway A"},{id:"b",label:"Pathway B"},{id:"c",label:"Pathway C"},{id:"d",label:"Pathway D"}],
  rows:[{id:"first",label:"Site 1",total:100,values:[25,25,25,25]},{id:"second",label:"Site 2",total:100,values:[40,20,30,10]}]} satisfies ReportChartSpec;
export const CategoricalFourSeries:Story={args:{spec:categoricalFixture},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelectorAll("[data-report-chart-plot] pattern").length).toBe(3));
  await waitFor(()=>expect(canvasElement.querySelectorAll("[data-report-chart-plot] .recharts-bar-rectangle [fill^=\"url(#report-paint-\"]").length).toBeGreaterThan(0));
  await expect(within(canvasElement).getByRole("columnheader",{name:"Pathway D"})).toBeVisible();
}};
export const CategoricalDark:Story={args:{spec:categoricalFixture},globals:{theme:"dark"}};
export const CategoricalSiteBrand:Story={args:{spec:categoricalFixture},globals:{theme:"site"}};
export const CategoricalMobile:Story={args:{spec:categoricalFixture},render:args=><div className="w-full max-w-[390px] p-3"><ReportChart {...args}/></div>};
export const PrintExactValues:Story={args:{spec:categoricalFixture,presentation:"print"},play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole("table",{name:"Delivery pathways exact values"})).toBeVisible();
  expect(canvasElement.querySelector("[data-report-chart-plot]")).toBeNull();
}};

/** Nested theme scopes must resolve aliases from the active theme, not :root. */
export const DarkTokenResolution:Story={args:{spec:categoricalFixture},globals:{theme:"dark"},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelector("[data-report-chart-plot]")).not.toBeNull());
  const plot=canvasElement.querySelector("[data-report-chart-plot]")!;
  const tokens=getComputedStyle(plot);
  expect(tokens.getPropertyValue("--report-axis").trim()).toBe(tokens.getPropertyValue("--muted-foreground").trim());
  expect(tokens.getPropertyValue("--report-grid").trim()).toBe(tokens.getPropertyValue("--border").trim());
  expect(tokens.getPropertyValue("--report-separator").trim()).toBe(tokens.getPropertyValue("--card").trim());
}};

export const FixedSharedAxis:Story={args:{spec:{...fixture,axisMax:200}}};
export const ReservedSeriesSlots:Story={args:{spec:{title:"Filtered categorical family",description:"Stable reserved slots even after filtering and reordering.",valueLabel:"Registrations",kind:"distribution",population:"Synthetic disjoint population",total:100,seriesOrder:["a","b","c","d"],points:[{id:"d",label:"Pathway D",value:70},{id:"b",label:"Pathway B",value:30}]}},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelector("[data-report-chart-plot]")).not.toBeNull());
  await waitFor(()=>expect(canvasElement.querySelectorAll("[data-report-chart-plot] pattern").length).toBe(2));
}};
