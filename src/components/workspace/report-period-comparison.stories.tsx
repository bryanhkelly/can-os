import {chromaticWidthModes} from "../../../.storybook/viewports";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {ReportMetricComparison} from "./report-period-comparison";
const meta={title:"V6.1 foundations/Data Visualization/Period comparison",component:ReportMetricComparison,args:{compare:true,items:[
  {id:"a",label:"Registrations",value:15,prior:10},{id:"b",label:"Verified attendance",value:0,prior:0},
  {id:"c",label:"Formal completions",value:null,prior:null},
]}} satisfies Meta<typeof ReportMetricComparison>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Comparison:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByText("Prior 10 · Change +5")).toBeVisible();
  await expect(canvas.getByText("Prior 0 · Change 0")).toBeVisible();
  await expect(canvas.getByText("Prior comparison unavailable")).toBeVisible();
}};
export const Mobile:Story={parameters:{chromatic:{modes: chromaticWidthModes([390])}},render:args=><div className="max-w-[390px]"><ReportMetricComparison {...args}/></div>};
export const Dark:Story={globals:{theme:"dark"}};

export const SiteBrand:Story={globals:{theme:"site"}};
