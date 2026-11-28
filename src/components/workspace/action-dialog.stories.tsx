import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ActionDialog } from "./action-dialog";

const meta = { id: "workspace-action-dialog", title: "04 Application patterns/Action dialog", component: ActionDialog } satisfies Meta<typeof ActionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const args = { open: false, title: "Revoke preview", description: "Existing links will stop working.",
  confirmLabel: "Revoke link", onConfirm: () => {}, onClose: () => {}, destructive: true };

function NestedExample({ pending = false }: { pending?: boolean }) {
  const [sharing,setSharing] = useState(false);
  const [confirming,setConfirming] = useState(false);
  const [confirmed,setConfirmed] = useState(false);
  return <>
    <Button onClick={()=>setSharing(true)}>Share preview</Button>
    <Modal open={sharing} onClose={()=>setSharing(false)} label="Sharing">
      <div className="space-y-3 p-5">
        <Button onClick={()=>setConfirming(true)}>Revoke preview</Button>
        <Button variant="outline" onClick={()=>setSharing(false)}>Close sharing</Button>
        {confirmed&&<p role="status">Revocation confirmed</p>}
      </div>
    </Modal>
    <ActionDialog {...args} open={confirming} pending={pending}
      onClose={()=>setConfirming(false)} onConfirm={()=>{setConfirmed(true);setConfirming(false);}}/>
  </>;
}

export const NestedConfirmation: Story = {
  args, render: ()=> <NestedExample/>,
  play: async ({canvasElement})=>{
    const canvas=within(canvasElement);
    const trigger=canvas.getByRole("button",{name:"Share preview"});
    await userEvent.click(trigger);
    const sharing=within(canvas.getByRole("dialog",{name:"Sharing"}));
    const revoke=sharing.getByRole("button",{name:"Revoke preview"});
    await userEvent.click(revoke);
    let dialog=within(canvas.getByRole("dialog",{name:"Revoke preview"}));
    await expect(dialog.getByRole("button",{name:"Cancel"})).toHaveFocus();
    await userEvent.keyboard("[Escape]");
    await expect(canvas.queryByRole("dialog",{name:"Revoke preview"})).not.toBeInTheDocument();
    await expect(revoke).toHaveFocus();
    await userEvent.click(revoke);
    dialog=within(canvas.getByRole("dialog",{name:"Revoke preview"}));
    await userEvent.click(dialog.getByRole("button",{name:"Revoke link"}));
    await expect(sharing.getByRole("status")).toHaveTextContent("Revocation confirmed");
    await userEvent.click(sharing.getByRole("button",{name:"Close sharing"}));
    await expect(trigger).toHaveFocus();
  },
};
export const PendingCannotDismiss: Story = {
  args, render: ()=> <NestedExample pending/>,
  play: async ({canvasElement})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole("button",{name:"Share preview"}));
    await userEvent.click(canvas.getByRole("button",{name:"Revoke preview"}));
    const element=canvas.getByRole("dialog",{name:"Revoke preview"});
    const dialog=within(element);
    await expect(element).toHaveAttribute("aria-busy","true");
    await expect(dialog.getByRole("button",{name:"Cancel"})).toBeDisabled();
    await expect(dialog.getByRole("button",{name:"Saving..."})).toBeDisabled();
    await userEvent.keyboard("[Escape]");
    await expect(element).toBeVisible();
  },
};
