import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "./mutation-feedback";
import { ContextTray } from "./context-tray";

function RecoveryContent() {
  const [writes, setWrites] = useState(0);
  const [refreshes, setRefreshes] = useState(0);
  const mutation = useMutationFeedback(async () => {
    setRefreshes(value => value + 1);
    if (!refreshes) throw new Error("Isolated refresh failure");
  });
  return <>
    <p>Commands: {writes}</p>
    <Button disabled={mutation.pending || mutation.refreshFailed} onClick={() => void mutation.run(async () => {
      setWrites(value => value + 1);
    }, { successMessage: "Notification marked as read.", commandErrorMessage: "Unable to update." })}>Mark notification read</Button>
    <MutationFeedback state={mutation} pendingMessage="Updating..." />
  </>;
}
function Example() {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)} aria-expanded={open}>Notifications</Button>
    <ContextTray title="Notifications" open={open} onClose={() => setOpen(false)} keepMounted>
      <RecoveryContent />
    </ContextTray>
  </>;
}
const meta = { title: "Foundations/Context tray", component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RetainedRecovery: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Notifications" });
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole("button", { name: "Mark notification read" }));
    await expect(canvas.getByRole("button", { name: "Mark notification read" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Close Notifications" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await expect(canvas.getByText("Commands: 1")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Mark notification read" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Retry refresh" }));
    await expect(canvas.getByRole("button", { name: "Mark notification read" })).toBeEnabled();
    await expect(canvas.getByText("Commands: 1")).toBeVisible();
    fireEvent(canvas.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
