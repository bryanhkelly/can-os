import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./page-frame";
import { WorkspacePanel } from "./workspace-panel";
import { DashboardPanel } from "./dashboard-layout";
import { QueryState } from "./query-state";

const meta = {title:"Workspace/Responsive composition",parameters:{layout:"padded"}} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const longTitle = "CommunityLearningCenterWithAnUnusuallyLongUnbrokenName";
const actions = <><Button variant="outline">View report</Button><Button>Manage program</Button></>;

export const NarrowWorkspace: Story = {
  render:()=> <div data-testid="narrow-workspace" className="w-full max-w-72 space-y-4">
    <PageHeader title={longTitle} subtitle="An example of a narrow workspace with long source-owned content." actions={actions}/>
    <WorkspacePanel title={longTitle} actions={actions}><p>Workspace content</p></WorkspacePanel>
    <DashboardPanel title={longTitle} action={actions}><p>Dashboard content</p></DashboardPanel>
    <QueryState error={longTitle} onRetry={()=>{}}/>
  </div>,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const root=canvas.getByTestId("narrow-workspace");
    const bounds=root.getBoundingClientRect();
    for(const heading of canvas.getAllByRole("heading")){
      await expect(heading.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right+1);
      await expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth+1);
    }
    for(const button of canvas.getAllByRole("button")){
      await expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right+1);
    }
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth+1);
  },
};
export const StandardWorkspace: Story = {
  render:()=> <div className="w-full max-w-4xl space-y-4">
    <PageHeader title="Community learning center" actions={actions}/>
    <WorkspacePanel title="Program management" actions={actions}><p>Workspace content</p></WorkspacePanel>
    <DashboardPanel title="Participation overview" action={actions}><p>Dashboard content</p></DashboardPanel>
    <QueryState error="Could not load the current report." onRetry={()=>{}}/>
  </div>,
};
