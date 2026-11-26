import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { Button } from "@/components/ui/button";
import { AsyncOperationStatus, GovernedSaveAction, type ActionState, type OperationState } from "./action-state";
import { WorkspaceShell } from "./workspace-shell";
const meta = { title: "06 Interaction states/Actions and operations" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const saveStates: ActionState[] = [
  {kind:"unchanged"},{kind:"ready"},{kind:"saving"},{kind:"saved"},
  {kind:"blocked",detail:"Enter a Site name."},{kind:"failed",detail:"Connection lost. Your edits remain."},
  {kind:"conflict",detail:"Review the newer revision first."},{kind:"partial",detail:"Refresh failed after saving."},
];
const operationStates: OperationState[] = [{kind:"idle"},{kind:"queued"},{kind:"running"},{kind:"succeeded"},
  {kind:"failed",detail:"Provider rejected the request."},{kind:"partial",detail:"The artifact is saved; distribution failed."},{kind:"unavailable",detail:"Unable to retrieve job status."}];
export const StateMatrix: Story = { render: () => <WorkspaceShell title="Action state reference">
  <div className="grid gap-4 sm:grid-cols-2">{saveStates.map(state => <div key={state.kind} className="border p-4"><GovernedSaveAction state={state} onSave={()=>{}}/></div>)}</div>
  <div className="mt-6 space-y-3">{operationStates.map(state => <AsyncOperationStatus key={state.kind} title="Generate content" state={state}/>)}</div>
</WorkspaceShell> };
function RecoveryFixture(){
  const [state,setState]=useState<ActionState>({kind:"blocked",detail:"Complete required fields."});
  return <WorkspaceShell title="Simulated save lifecycle">
    <Button onClick={()=>setState({kind:"ready"})}>Complete required fields</Button>
    <GovernedSaveAction state={state} onSave={()=>setState({kind:"saving"})}
      recovery={state.kind==="saving" ? <Button variant="outline" onClick={()=>setState({kind:"partial",detail:"Saved; refresh failed."})}>Simulate partial success</Button> :
      state.kind==="partial" ? <Button variant="outline" onClick={()=>setState({kind:"saved"})}>Retry refresh</Button>:undefined}/>
  </WorkspaceShell>;
}
export const Recovery:Story={render:()=> <RecoveryFixture/>,play:async({canvasElement})=>{
  const c=within(canvasElement);
  await expect(c.getByRole("button",{name:"Save and continue"})).toBeDisabled();
  await userEvent.click(c.getByRole("button",{name:"Complete required fields"}));
  await userEvent.click(c.getByRole("button",{name:"Save and continue"}));
  await expect(c.getByRole("button",{name:"Saving…"})).toBeDisabled();
  await userEvent.click(c.getByRole("button",{name:"Simulate partial success"}));
  await expect(c.getByRole("button",{name:"Save and continue"})).toBeDisabled();
  await userEvent.click(c.getByRole("button",{name:"Retry refresh"}));
  await expect(c.getByText("Saved",{exact:true})).toBeVisible();
}};
