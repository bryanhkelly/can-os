import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {FamilyJourneyProgress} from "./FamilyJourneyProgress";
import {WorkspacePanel} from "@/components/workspace/workspace-panel";
const meta={title:"08 Feature workspaces/Family onboarding progress",component:FamilyJourneyProgress,decorators:[Story=><div className="p-5"><WorkspacePanel title="Household checklist"><Story/></WorkspacePanel></div>]} satisfies Meta<typeof FamilyJourneyProgress>;
export default meta;
type Story=StoryObj<typeof meta>;
export const PendingRequirements:Story={args:{milestones:[{label:"Email verified",complete:true},{label:"Guardian consent",complete:false,detail:"Signature required."},{label:"School-year enrollment",complete:false}]},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("1 of 3 milestones confirmed complete")).toBeVisible();
 await expect(c.getByText("Signature required.")).toBeVisible();
 await expect(c.getAllByText("Not confirmed")).toHaveLength(2);
}};
export const Empty:Story={args:{milestones:[]}};
