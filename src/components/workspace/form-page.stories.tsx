import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormActions, FormSection } from "./form-page";

function DedicatedForm({ pending = false, onSubmit }: { pending?: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return <form className="max-w-3xl" onSubmit={event => { event.preventDefault(); onSubmit(name); }}>
    <div className="space-y-8">
      <FormSection title="Scope" description="Where this school year applies.">
        <Field label="Site"><Input defaultValue="Valor Christian Academy" readOnly /></Field>
      </FormSection>
      <FormSection title="Dates">
        <Field label="Year name" required><Input value={name} onChange={event => setName(event.target.value)} /></Field>
        <Field label="Starts" required><Input type="date" /></Field>
      </FormSection>
    </div>
    <FormActions submitLabel="Create school year" pendingLabel="Creating school year…" pending={pending}
      disabled={!name.trim()} cancel={<a href="#school-years">Cancel</a>} />
  </form>;
}

const meta = {
  title: "Foundations/Dedicated form page",
  component: DedicatedForm,
  args: { onSubmit: fn() },
  render: args => <div className="min-h-screen bg-background p-4 sm:p-8"><DedicatedForm {...args} /></div>,
} satisfies Meta<typeof DedicatedForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedFieldsAndActions: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const sections = canvasElement.querySelectorAll("[data-form-section]");
    await expect(sections).toHaveLength(2);
    await expect(canvas.getByRole("region", { name: "Scope" })).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Dates" })).toBeVisible();
    const submit = canvas.getByRole("button", { name: "Create school year" });
    await expect(submit).toBeDisabled();
    const actions = canvasElement.querySelector("[data-form-actions]");
    await expect(actions?.firstElementChild).toBe(submit);
    await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "#school-years");
    await userEvent.type(canvas.getByLabelText(/Year name/), "2026–2027");
    await userEvent.type(canvas.getByLabelText(/Starts/), "2026-08-17");
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledWith("2026–2027");
  },
};

export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Creating school year…" })).toBeDisabled();
  },
};
