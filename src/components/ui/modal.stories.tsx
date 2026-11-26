import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Modal } from "./modal";

const meta = {
  id: "foundations-modal", title: "02 Primitives/Modal",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function ModalExample() {
  const [open, setOpen] = useState(false);
  return <div className="bg-background p-6 text-foreground">
    <Button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      Open review dialog
    </Button>
    <Modal open={open} onClose={() => setOpen(false)}
      label="Example review dialog" dismissOnBackdrop>
      <div className="space-y-4 p-6">
        <h2 className="font-serif text-2xl">Review draft</h2>
        <p className="text-sm text-muted-foreground">This dialog is a component example. It does not grant approval or save records.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>Close dialog</Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </div>
    </Modal>
  </div>;
}

export const KeyboardAndDismissal: Story = {
  render: () => <ModalExample/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open review dialog" }));
    const dialog = await canvas.findByRole("dialog", { name: "Example review dialog" });
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog", { name: "Example review dialog" })).not.toBeInTheDocument();
  },
};
