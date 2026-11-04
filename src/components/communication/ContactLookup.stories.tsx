import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ContactLookup } from "./ContactLookup";

function Example({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  return <div className="mx-auto max-w-xl p-5"><ContactLookup value={value} onChange={setValue} disabled={disabled}
    contacts={[
      { personId: "teacher", name: "Avery Teacher", label: "Avery Teacher - school staff (teacher)" },
      { personId: "guardian", name: "Morgan Guardian", label: "Morgan Guardian - guardian of enrolled student" },
    ]} /></div>;
}
const meta = { title: "Communication/Contact lookup", component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SearchAndSelect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Find a contact"), "guardian");
    await expect(canvas.queryByRole("button", { name: /Avery/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Morgan/ }));
    await expect(canvas.getByText("To: Morgan Guardian")).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Morgan/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.clear(canvas.getByLabelText("Find a contact"));
    await userEvent.type(canvas.getByLabelText("Find a contact"), "no match");
    await expect(canvas.getByText("No contacts match your search.")).toBeVisible();
    await expect(canvas.getByText("To: Morgan Guardian")).toBeVisible();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
export const Saving: Story = { args: { disabled: true } };
