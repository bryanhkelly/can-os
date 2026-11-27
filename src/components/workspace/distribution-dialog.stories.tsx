import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {DistributionDialog} from "./distribution-dialog";
import {WorkspaceNotice} from "./notice";
import {AsyncOperationStatus} from "./action-state";
import {ActionFooter} from "./action-footer";
const meta={title:"04 Application patterns/Distribution dialog"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
function Fixture({busy=false}:{busy?:boolean}){
 const [open,setOpen]=useState(false),[expiry,setExpiry]=useState("7"),[created,setCreated]=useState(false);
 return <div className="p-5"><Button onClick={()=>setOpen(true)}>Share preview</Button>
 <DistributionDialog title="Share a preview" description="Illustrative view-only link flow. No link is issued." open={open} onClose={()=>setOpen(false)} busy={busy}>
   <WorkspaceNotice>Sharing is not publication or enrollment approval.</WorkspaceNotice>
   <Field label="Link expiration"><Select value={expiry} disabled={busy} onChange={e=>setExpiry(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option></Select></Field>
   <ActionFooter layout="inline"><Button disabled={busy} onClick={()=>setCreated(true)}>Simulate link creation</Button></ActionFooter>
   {busy&&<AsyncOperationStatus title="Creating preview" state={{kind:"running"}}/>}
   {created&&<WorkspaceNotice tone="success">Example link created with {expiry} day expiration. No external link exists.</WorkspaceNotice>}
 </DistributionDialog></div>;
}
export const ShareAndReturn:Story={render:()=> <Fixture/>,play:async({canvasElement})=>{
 const c=within(canvasElement),trigger=c.getByRole("button",{name:"Share preview"});
 await userEvent.click(trigger);const dialog=within(c.getByRole("dialog",{name:"Share a preview"}));
 await userEvent.selectOptions(dialog.getByRole("combobox",{name:"Link expiration"}),"30");
 await userEvent.click(dialog.getByRole("button",{name:"Simulate link creation"}));
 await expect(dialog.getByText(/Example link created with 30 day/)).toBeVisible();
 await userEvent.keyboard("{Escape}");await expect(trigger).toHaveFocus();
}};
export const Busy:Story={render:()=> <Fixture busy/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await userEvent.click(c.getByRole("button",{name:"Share preview"}));
 const dialog=within(c.getByRole("dialog",{name:"Share a preview"}));
 await expect(dialog.getByRole("button",{name:"Close sharing"})).toBeDisabled();
 await userEvent.keyboard("{Escape}");await expect(c.getByRole("dialog")).toBeVisible();
}};
