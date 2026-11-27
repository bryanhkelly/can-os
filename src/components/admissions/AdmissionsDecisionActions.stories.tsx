import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent,fn} from "storybook/test";
import {AdmissionsDecisionActions} from "./AdmissionsDecisionActions";
const meta={title:"08 Feature workspaces/Admissions decisions",component:AdmissionsDecisionActions,args:{stage:"eligibility",busy:false,onDecision:fn()},decorators:[Story=><div className="p-5"><Story/></div>]} satisfies Meta<typeof AdmissionsDecisionActions>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Eligibility:Story={play:async({canvasElement,args})=>{
 const c=within(canvasElement);await userEvent.click(c.getByRole("button",{name:"Approve for offer"}));await expect(args.onDecision).toHaveBeenCalledWith("accept","Approve for offer");
}};
export const Waitlisted:Story={args:{disposition:"waitlisted"},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByRole("button",{name:"Restore to review"})).toBeVisible();await expect(c.queryByRole("button",{name:"Approve for offer"})).not.toBeInTheDocument();
}};
export const Busy:Story={args:{busy:true},play:async({canvasElement})=>{for(const button of within(canvasElement).getAllByRole("button"))await expect(button).toBeDisabled();}};
export const Closed:Story={args:{stage:"withdrawn"},play:async({canvasElement})=>{await expect(within(canvasElement).queryByRole("button")).not.toBeInTheDocument();}};
