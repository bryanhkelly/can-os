import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {WorkQueue,type WorkQueueItem} from "./work-queue";
import {WorkspaceShell} from "./workspace-shell";
const meta={title:"04 Application patterns/Work and approval queue"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
const items:WorkQueueItem[]=[
 {id:"a",category:"Program readiness",title:"Verify facilitator coverage",priority:"critical",detail:"An authorized operator must review coverage.",responsibility:"Owner: Site operator",actions:<a href="#coverage" className="underline">Review coverage</a>},
 {id:"b",category:"Publishing",title:"Review offering evidence",priority:"normal",responsibility:"Owner: independent reviewer"},
];
export const Assigned:Story={render:()=> <WorkspaceShell title="My work"><WorkQueue items={items}/></WorkspaceShell>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("2 open")).toBeVisible();await expect(c.getByRole("link",{name:"Review coverage"})).toHaveAttribute("href","#coverage");
}};
export const LimitedInventory:Story={render:()=> <WorkspaceShell title="Platform work"><WorkQueue items={items} limited description="Only the current authorized page is shown."/></WorkspaceShell>};
export const Empty:Story={render:()=> <WorkspaceShell title="My work"><WorkQueue items={[]}/></WorkspaceShell>};
export const Loading:Story={render:()=> <WorkspaceShell title="My work"><WorkQueue items={[]} loading="Loading authorized work…"/></WorkspaceShell>};
function RetryFixture(){
 const [failed,setFailed]=useState(true);
 return <WorkspaceShell title="My work"><WorkQueue items={failed?[]:items} error={failed?"Work could not be loaded.":undefined} onRetry={()=>setFailed(false)} toolbar={<Button variant="outline" onClick={()=>setFailed(true)}>Simulate read error</Button>}/></WorkspaceShell>;
}
export const Retry:Story={render:()=> <RetryFixture/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByRole("alert")).toHaveTextContent("Work could not be loaded.");
 await userEvent.click(c.getByRole("button",{name:"Retry"}));await expect(c.getByText("2 open")).toBeVisible();
}};
