import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent,fn} from "storybook/test";
import {SiteGenerationStatus} from "./SiteGenerationStatus";
import {generationEligibility} from "@/domain/site-generation-status";
const now=new Date("2026-11-26T10:00:00Z");
const initial={attempt:null,activeUntil:null,dailyCount:0,configured:true,now};
const meta={title:"08 Feature workspaces/Launch Studio/Site Intelligence status",component:SiteGenerationStatus,args:{onReload:fn(),eligibility:generationEligibility(initial)},tags:["critical","responsive"],decorators:[Story=><div className="max-w-2xl p-4"><Story/></div>]} satisfies Meta<typeof SiteGenerationStatus>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Available:Story={};
export const ProviderUnavailable:Story={args:{eligibility:generationEligibility({...initial,configured:false})},play:async({canvasElement,args})=>{
 const c=within(canvasElement);await expect(c.getByText("AI generation is not configured for this deployment.")).toBeVisible();
 await expect(c.queryByText("Site content generation: Completed")).not.toBeInTheDocument();
 await userEvent.click(c.getByRole("button",{name:"Reload generation status"}));await expect(args.onReload).toHaveBeenCalled();
}};
export const Processing:Story={args:{eligibility:generationEligibility({...initial,attempt:{status:"processing",attempts:1,errorCode:null,updatedAt:now},activeUntil:new Date("2026-11-26T10:05:00Z")})}};
export const ReadyToReuse:Story={args:{eligibility:generationEligibility({...initial,attempt:{status:"ready",attempts:1,errorCode:null,updatedAt:now}})}};
export const ConfirmedButReadUnavailable:Story={args:{readError:"The stored package could not be loaded.",feedback:{kind:"refresh-required",message:"Processing was confirmed. Reload stored content before repeating processing."}},play:async({canvasElement,args})=>{
 const c=within(canvasElement);await expect(c.getByText("Last request: Completed with follow-up")).toBeVisible();await expect(c.getByText("The stored package could not be loaded.")).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Reload generation status"}));await expect(args.onReload).toHaveBeenCalled();
}};
export const RetryCooldown:Story={args:{eligibility:generationEligibility({...initial,attempt:{status:"failed",attempts:2,errorCode:"gloo_http_401",updatedAt:now}})}};
