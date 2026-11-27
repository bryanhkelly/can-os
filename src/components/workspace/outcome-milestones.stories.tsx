import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {OutcomeMilestones} from "./outcome-milestones";
import {WorkspaceShell} from "./workspace-shell";
const meta={title:"04 Application patterns/Outcome milestones"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
export const Mixed:Story={render:()=> <WorkspaceShell title="Program preparation">
  <OutcomeMilestones items={[
    {id:"site",title:"Site established",detail:"Confirmed identity.",state:"complete"},
    {id:"preview",title:"Website preview",detail:"Ready for review.",state:"next"},
    {id:"approval",title:"Program approval",detail:"Evidence missing.",state:"blocked"},
    {id:"opening",title:"Opening",detail:"Reader unavailable.",state:"unavailable"},
    {id:"enrollment",title:"Enrollment",detail:"Not confirmed.",state:"pending"},
  ]}/>
</WorkspaceShell>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByRole("progressbar")).toHaveAttribute("value","1");
 await expect(c.getByText("1 of 5 milestones confirmed complete")).toBeVisible();
 await expect(c.getByText("Status unavailable")).toBeVisible();
}};
export const Empty:Story={render:()=> <WorkspaceShell title="Program preparation"><OutcomeMilestones items={[]}/></WorkspaceShell>};
