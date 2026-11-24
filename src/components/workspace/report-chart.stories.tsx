import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ReportChart } from "./report-chart";
const meta = {
  title:"Foundations/V6.1 reporting charts", component:ReportChart,
  parameters:{chromatic:{modes:{light:{theme:"light"},dark:{theme:"dark"}}}},
  args:{spec:{title:"Pilot participation",description:"Synthetic fixture only. Counts overlap.",valueLabel:"Registrations",
    kind:"comparison",format:"count",points:[{id:"registered",label:"Registered",value:102},{id:"engaged",label:"Engaged",value:87},{id:"completed",label:"Completed",value:69}]}},
} satisfies Meta<typeof ReportChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole("table",{name:"Pilot participation exact values"})).toBeVisible();
  await expect(canvas.getByRole("rowheader",{name:"Completed"})).toBeVisible();
  await expect(canvas.getByText("69",{exact:true})).toBeVisible();
}};
export const Trend: Story = {args:{spec:{...meta.args.spec,title:"Monthly participation",kind:"trend",
  points:[{id:"jan",label:"Jan",value:12},{id:"feb",label:"Feb",value:null},{id:"mar",label:"Mar",value:23}]}}};
export const Missing: Story = {args:{spec:{...meta.args.spec,points:[{id:"missing",label:"Not measured",value:null}]}},
  play:async({canvasElement})=>{const canvas=within(canvasElement);await expect(canvas.getByText("Unavailable",{exact:true})).toBeVisible();}};
export const Zero: Story = {args:{spec:{...meta.args.spec,points:[{id:"zero",label:"Registered",value:0}]}}};
export const Mobile: Story = {parameters:{chromatic:{viewports:[390]}},render:args=><div className="max-w-[390px]"><ReportChart {...args}/></div>};
export const Dark: Story = {globals:{theme:"dark"},parameters:{chromatic:{viewports:[390,1440]}}};
