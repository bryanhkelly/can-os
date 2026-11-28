import {useRef,useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import type {MutationFeedbackState} from "@/lib/mutation-feedback";
import {MutationFeedback} from "./mutation-feedback";
import {WorkspaceShell} from "./workspace-shell";
import {FormActions} from "./form-page";

const idle:MutationFeedbackState={pending:false,notice:"",error:"",refreshFailed:false};
const meta={title:"06 Interaction states/Mutation feedback",component:MutationFeedback,
 args:{state:idle,pendingMessage:"Saving the record…"},
 tags:["critical","interaction"],
 parameters:{docs:{description:{component:"Canonical feedback for a command followed by a read refresh. A saved command with a failed refresh must recover the read, not submit the command twice."}}},
 decorators:[Story=><div className="bg-background p-4"><Story/></div>]} satisfies Meta<typeof MutationFeedback>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Saving:Story={args:{state:{...idle,pending:true}}};
export const Saved:Story={args:{state:{...idle,notice:"Fixture saved successfully."}}};
export const CommandFailed:Story={args:{state:{...idle,error:"The fixture command failed. Preserve the original draft."}}};
export const RefreshFailed:Story={args:{state:{...idle,error:"The saved record could not be refreshed.",notice:"Fixture saved.",refreshFailed:true}}};
function RecoveryFixture({failure}:{failure:"command"|"refresh"}){
 const [name,setName]=useState("Community learning center");
 const [commands,setCommands]=useState(0),[reads,setReads]=useState(0);
 const commandCount=useRef(0),readCount=useRef(0);
 const feedback=useMutationFeedback(async()=>{
   readCount.current++;setReads(readCount.current);
   return {ok:failure!=="refresh"||readCount.current>1};
 });
 async function submit(){
   await feedback.run(async()=>{
     commandCount.current++;setCommands(commandCount.current);
     if(failure==="command"&&commandCount.current===1)throw Error("Simulated write failure");
     return {name};
   },{successMessage:"Fixture saved successfully.",commandErrorMessage:"Fixture save failed. Your draft is preserved.",refreshErrorMessage:"The saved fixture could not refresh."});
 }
 return <WorkspaceShell title="Recover from a failed operation" subtitle="Synthetic local command and read adapters. No server, database or provider access.">
  <form className="mt-6 space-y-4" onSubmit={event=>{event.preventDefault();void submit();}}>
   <Field label="Site name"><Input value={name} onChange={event=>setName(event.target.value)} disabled={feedback.pending||feedback.refreshFailed}/></Field>
   <FormActions submitLabel="Save fixture" pendingLabel="Saving…" pending={feedback.pending} disabled={feedback.refreshFailed||!name.trim()}
    blockedReason={feedback.refreshFailed?"Refresh the saved record before another command.":!name.trim()?"Enter a Site name.":undefined}/>
   <MutationFeedback state={feedback} pendingMessage="Saving the fixture…"/>
  </form>
  <p className="mt-4 text-sm">Command attempts: {commands}</p>
  <p className="text-sm">Read attempts: {reads}</p>
 </WorkspaceShell>;
}
export const RetryReadWithoutDuplicateWrite:Story={render:()=> <RecoveryFixture failure="refresh"/>,play:async({canvasElement})=>{
 const c=within(canvasElement);
 await userEvent.click(c.getByRole("button",{name:"Save fixture"}));
 await expect(c.getByRole("alert")).toHaveTextContent("The command succeeded.");
 await expect(c.getByRole("button",{name:"Save fixture"})).toBeDisabled();
 await expect(c.getByText("Command attempts: 1")).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Retry refresh"}));
 await expect(c.getByText("Fixture saved successfully.")).toBeVisible();
 await expect(c.getByText("Read attempts: 2")).toBeVisible();
 await expect(c.getByText("Command attempts: 1")).toBeVisible();
 await expect(c.getByRole("button",{name:"Save fixture"})).toBeEnabled();
}};
export const RetryCommandPreservesDraft:Story={render:()=> <RecoveryFixture failure="command"/>,play:async({canvasElement})=>{
 const c=within(canvasElement);
 await userEvent.click(c.getByRole("button",{name:"Save fixture"}));
 await expect(c.getByRole("alert")).toHaveTextContent("Fixture save failed. Your draft is preserved.");
 await expect(c.getByRole("textbox",{name:"Site name"})).toHaveValue("Community learning center");
 await expect(c.getByText("Read attempts: 0")).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Save fixture"}));
 await expect(c.getByText("Fixture saved successfully.")).toBeVisible();
 await expect(c.getByText("Command attempts: 2")).toBeVisible();
 await expect(c.getByText("Read attempts: 1")).toBeVisible();
}};
