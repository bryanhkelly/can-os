import type {Meta,StoryObj} from "@storybook/react-vite";
import {useState,type ComponentProps} from "react";
import {expect,within,userEvent} from "storybook/test";
import {ReportGeographyFilter} from "./report-geography-filter";
const meta={title:"Foundations/V6.1 reporting geography filter",component:ReportGeographyFilter,args:{
 value:"",basis:"current",options:[{code:"US-CBSA-12060",name:"Atlanta Metro",kind:"metro"},{code:"US-GA",name:"Georgia",kind:"state"},{code:"US-COUNTY-13067",name:"Cobb County",kind:"county"}],onChange:()=>{},
 },parameters:{chromatic:{modes:{light:{theme:"light"},dark:{theme:"dark"}}}}} satisfies Meta<typeof ReportGeographyFilter>;
export default meta;
type Story=StoryObj<typeof meta>;
function Controlled(args:ComponentProps<typeof ReportGeographyFilter>){
 const [value,setValue]=useState(args.value);return <ReportGeographyFilter {...args} value={value} onChange={setValue}/>;
}
export const MarketSelection:Story={render:args=><Controlled {...args}/>,play:async({canvasElement})=>{
 const canvas=within(canvasElement),select=canvas.getByRole("combobox",{name:"Delivery geography"});
 await userEvent.selectOptions(select,"US-CBSA-12060");await expect(select).toHaveValue("US-CBSA-12060");
 await userEvent.selectOptions(select,"");await expect(select).toHaveValue("");
}};
export const Historical:Story={args:{basis:"historical",value:"US-GA"}};
export const Unknown:Story={args:{value:"market:unknown",options:[]}};
export const OutsideMarket:Story={args:{value:"market:outside"}};
export const Loading:Story={args:{loading:true}};
export const ErrorState:Story={args:{error:true}};
export const StaleSelection:Story={args:{value:"US-CBSA-99999"},play:async({canvasElement})=>{
 await expect(within(canvasElement).getByText("Selected geography unavailable",{exact:true})).toBeInTheDocument();
}};
export const Mobile:Story={parameters:{chromatic:{viewports:[390]}},render:args=><div className="max-w-[390px]"><Controlled {...args}/></div>};
export const Dark:Story={globals:{theme:"dark"}};
