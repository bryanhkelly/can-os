import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Field} from "@/components/ui/field";
import {WorkspaceShell} from "./workspace-shell";
import {WorkspacePanel} from "./workspace-panel";
import {OutcomeMilestones,type OutcomeMilestone} from "./outcome-milestones";
import {DistributionDialog} from "./distribution-dialog";
import {ActionStateIndicator,GovernedSaveAction} from "./action-state";
import {WorkspaceNotice} from "./notice";
const meta={title:"10 User journeys/Launch Studio pilot",tags:["journey","responsive","critical"],parameters:{docs:{description:{component:"Synthetic interaction using shared V6.1 patterns. No Site, link, enrollment or approval is written."}}}} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
function Journey({ready=false}:{ready?:boolean}){
 const [name,setName]=useState(ready?"Community Learning Center":""),[saved,setSaved]=useState(ready),[shareOpen,setShareOpen]=useState(false),
 [preview,setPreview]=useState(ready),[prepared,setPrepared]=useState(ready),[shared,setShared]=useState(false);
 const items:OutcomeMilestone[]=[
 {id:"site",title:"Site identity",state:saved?"complete":"next",detail:saved?"Fixture identity saved.":"Name your Site."},
 {id:"preview",title:"Website preview",state:preview?"complete":saved?"next":"pending",detail:"View-only preview, not publication."},
 {id:"program",title:"Pilot selection",state:prepared?"complete":preview?"next":"pending",detail:"Prepare the digital skills experience."},
 {id:"opening",title:"Opening approval",state:"blocked",detail:"Independent approval is not recorded."}
 ];
 return <WorkspaceShell title="Prepare a community learning pilot" eyebrow="Launch Studio" subtitle="Illustrative journey using synthetic data. No real commands are issued." width="wide">
  <OutcomeMilestones title="Your path to opening" items={items}/>
  {!saved&&<WorkspacePanel title="Establish your Site" className="mt-4">
    <Field label="Site name"><Input value={name} onChange={e=>setName(e.target.value)}/></Field>
    <div className="mt-4"><GovernedSaveAction state={name.trim()?{kind:"ready"}:{kind:"blocked",detail:"Enter a Site name."}} label="Save Site identity" onSave={()=>setSaved(true)}/></div>
  </WorkspacePanel>}
  {saved&&<WorkspacePanel title="Share your website" className="mt-4">
   {!preview?<Button onClick={()=>setPreview(true)}>Create website preview</Button>:<Button variant="outline" onClick={()=>setShareOpen(true)}>Share preview</Button>}
   {shared&&<WorkspaceNotice tone="success" className="mt-3">Fixture sharing completed. No external link was created.</WorkspaceNotice>}
  </WorkspacePanel>}
  {preview&&<WorkspacePanel title="Prepare a program" className="mt-4">
    <p className="text-sm text-muted-foreground">Four-session digital skills workshop</p>
    {!prepared&&<Button className="mt-3" onClick={()=>setPrepared(true)}>Select pilot</Button>}
    {prepared&&<p className="mt-3 text-sm">Pilot selected in this fixture.</p>}
  </WorkspacePanel>}
  <WorkspacePanel title="Open registration" className="mt-4"><ActionStateIndicator state={{kind:"blocked",detail:"Independent publication approval is required."}}/><Button className="mt-3" disabled>Open registration</Button></WorkspacePanel>
  <DistributionDialog title="Share website preview" description="Simulated link creation. No external URL is issued." open={shareOpen} onClose={()=>setShareOpen(false)}>
    <WorkspaceNotice>Sharing does not publish this Site.</WorkspaceNotice>
    <Button onClick={()=>{setShared(true);setShareOpen(false);}}>Simulate sharing</Button>
  </DistributionDialog>
 </WorkspaceShell>;
}
export const ReadyForReview:Story={render:()=> <Journey ready/>};
export const CompleteJourney:Story={render:()=> <Journey/>,play:async({canvasElement})=>{
 const c=within(canvasElement);
 await expect(c.getByRole("button",{name:"Save Site identity"})).toBeDisabled();
 await userEvent.type(c.getByRole("textbox",{name:"Site name"}),"Community Learning Center");
 await userEvent.click(c.getByRole("button",{name:"Save Site identity"}));
 await userEvent.click(c.getByRole("button",{name:"Create website preview"}));
 await userEvent.click(c.getByRole("button",{name:"Share preview"}));
 await userEvent.click(within(c.getByRole("dialog")).getByRole("button",{name:"Simulate sharing"}));
 await expect(c.getByText(/Fixture sharing completed/)).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Select pilot"}));
 await expect(c.getByText("3 of 4 milestones confirmed complete")).toBeVisible();
 await expect(c.getByRole("button",{name:"Open registration"})).toBeDisabled();
}};
