import {useState,type ComponentProps} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent,fn} from "storybook/test";
import {NoncreditParticipantRoster} from "./NoncreditParticipantRoster";
import {WorkspaceShell} from "@/components/workspace/workspace-shell";
type Roster=ComponentProps<typeof NoncreditParticipantRoster>["roster"];
const roster=[{registrationId:"r1",displayName:"Example learner",status:"withdrawn",seatReleased:false,completionOutcome:null,attendedLinkedSession:false}] as unknown as Roster;
const confirm=fn();
function Fixture({busy=false,empty=false}:{busy?:boolean;empty?:boolean}){
 const [target,setTarget]=useState<string|null>(null),[reason,setReason]=useState("");
 return <WorkspaceShell title="Noncredit cohort operations" width="wide"><NoncreditParticipantRoster roster={empty?[]:roster} busy={busy} seatTarget={target} seatReason={reason} onStartRelease={setTarget} onReasonChange={setReason} onConfirmRelease={id=>{confirm(id,reason);setTarget(null);}} onCancelRelease={()=>setTarget(null)}/></WorkspaceShell>;
}
const meta={title:"08 Feature workspaces/Noncredit participant roster",component:Fixture} satisfies Meta<typeof Fixture>;
export default meta;
type Story=StoryObj<typeof meta>;
export const SeatRelease:Story={play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("Not verified",{exact:true})).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Review capacity release"}));
 await expect(c.getByRole("button",{name:"Confirm release"})).toBeDisabled();
 await userEvent.type(c.getByRole("textbox",{name:"Reason for releasing the seat"}),"Verified withdrawal before session.");
 await userEvent.click(c.getByRole("button",{name:"Confirm release"}));
 await expect(confirm).toHaveBeenCalledWith("r1","Verified withdrawal before session.");
}};
export const Empty:Story={args:{empty:true}};
export const Busy:Story={args:{busy:true}};
