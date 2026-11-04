import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { WorkspaceShell } from "@/components/workspace";
import { Modal } from "@/components/ui/modal";
import { ContactLookup } from "./ContactLookup";
import { MessagesWorkspace } from "./MessagesWorkspace";

const threads = [
  { id: "school", subject: "Planning next semester", snippet: "Let's review the course options together.", contextType: "person", lastMessageAt: "2026-11-03T16:30:00Z" },
  { id: "assignment", subject: "Essay feedback", snippet: "Thank you for the thoughtful revision.", contextType: "assignment", lastMessageAt: "2026-11-02T18:00:00Z" },
];
function Example({ empty = false, loading = false, error = "" }: { empty?: boolean; loading?: boolean; error?: string }) {
  const [selectedId, setSelectedId] = useState(empty ? "" : "school");
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  return <WorkspaceShell width="wide" eyebrow="Communication / Conversations" title="Messages">
    <MessagesWorkspace threads={empty ? [] : threads} selectedId={selectedId} onSelect={setSelectedId}
      detail={selectedId ? { thread: { id: selectedId, subject: threads.find(thread => thread.id === selectedId)!.subject,
        contextType: "person", contextId: null, contextHref: null },
        messages: [{ id: "message", own: false, senderName: "Avery", body: "Let's review the course options together.",
          sentAt: "2026-11-03T16:30:00Z" }] } : null}
      loading={loading} loadingThread={loading} error={error} onRetry={() => undefined}
      reply={reply} onReplyChange={setReply} onSend={() => { setSent(true); setReply(""); }} busy={false}
      onCompose={() => setComposeOpen(true)}
      feedback={sent ? <p role="status">Message sent.</p> : null} />
    <Modal open={composeOpen} onClose={() => setComposeOpen(false)} label="New message">
      <div className="p-5"><ContactLookup value={recipient} onChange={setRecipient}
        contacts={[{personId:"teacher",name:"Avery Teacher",label:"Avery Teacher - school staff (teacher)"}]} /></div>
    </Modal>
  </WorkspaceShell>;
}
const meta = { title: "Communication/Messages", component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const back = canvas.getByRole("button", { name: "All conversations", hidden: true });
    if (back.getClientRects().length) {
      await userEvent.click(back);
      await userEvent.click(canvas.getByRole("button", { name: /Planning next semester/ }));
    }
    await expect(canvas.getByRole("button", { name: "Send reply" })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Reply to this conversation"), "Thank you. I will review the options.");
    await userEvent.click(canvas.getByRole("button", { name: "Send reply" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Message sent.");
    await expect(canvas.getByLabelText("Reply to this conversation")).toHaveValue("");
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
export const SearchConversations: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const back = canvas.getByRole("button", { name: "All conversations", hidden: true });
    if (back.getClientRects().length) await userEvent.click(back);
    await userEvent.type(canvas.getByLabelText("Search conversations"), "Essay");
    await expect(canvas.queryByRole("button", { name: /Planning next semester/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Essay feedback/ }));
    await expect(canvas.getByRole("heading", { name: "Essay feedback" })).toBeVisible();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
export const Empty: Story = { args: { empty: true } };
export const NewMessageLookup: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const create = canvas.getByRole("button", { name: "New message" });
    await expect(create).toBeVisible();
    await expect(create).toHaveAttribute("data-create-action");
    await expect(create).toHaveClass("bg-primary", "min-h-11");
    await expect(create.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(create);
    const dialog = within(canvas.getByRole("dialog", { name: "New message" }));
    await userEvent.type(dialog.getByLabelText("Find a contact"), "Avery");
    await userEvent.click(dialog.getByRole("button", { name: /Avery Teacher/ }));
    await expect(dialog.getByText("To: Avery Teacher")).toBeVisible();
  },
};
export const Loading: Story = { args: { loading: true } };
export const Unavailable: Story = { args: { error: "This conversation is unavailable in your current account." } };
