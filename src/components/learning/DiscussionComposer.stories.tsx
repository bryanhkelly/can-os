import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DiscussionComposer } from "./DiscussionComposer";

function Preview({ reply = false }: { reply?: boolean }) {
  const [draft, setDraft] = useState("");
  const [lastPost, setLastPost] = useState("");
  return <div className="max-w-xl border border-border bg-card p-6 text-foreground">
    <DiscussionComposer value={draft} onChange={setDraft}
      onSubmit={body => { setLastPost(body); setDraft(""); }}
      label={reply ? "Reply to message" : "New post"}
      submitLabel={reply ? "Post response" : "Post message"}
      maxLength={reply ? 5000 : 3000} />
    {lastPost && <p role="status" className="mt-3 text-sm">Preview received: {lastPost}</p>}
  </div>;
}

const meta = {
  id: "student-shared-discussion-composer", title: "08 Feature workspaces/Learning/Discussion composer",
  component: DiscussionComposer,
  args: { value: "", onChange: () => {}, onSubmit: () => {} },
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
} satisfies Meta<typeof DiscussionComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NewPost: Story = {
  render: () => <Preview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = canvas.getByRole("textbox", { name: /New post/ });
    const submit = canvas.getByRole("button", { name: "Post message" });
    await expect(message).toBeRequired();
    await expect(submit).toBeDisabled();
    await userEvent.type(message, "How does this example work?");
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(canvas.getByRole("status")).toHaveTextContent("How does this example work?");
    await expect(submit).toBeDisabled();
  },
};
export const Reply: Story = { render: () => <Preview reply /> };
export const Pending: Story = {
  render: () => <div className="max-w-xl bg-card p-6">
    <DiscussionComposer value="A reply currently being posted" onChange={() => {}}
      onSubmit={() => {}} pending />
  </div>,
};
