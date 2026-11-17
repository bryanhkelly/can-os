import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormSection } from "./form-page";
import { ActionFooter } from "./action-footer";
import { Button } from "@/components/ui/button";

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
    const action = within(canvasElement).getByRole("button", { name: "Creating school year…" });
    await expect(action).toBeDisabled();
    await expect(action).toHaveAttribute("aria-busy", "true");
    const cancel = within(canvasElement).getByRole("link", { name: "Cancel" });
    await expect(cancel).toHaveAttribute("aria-disabled", "true");
    await expect(cancel).toHaveAttribute("tabindex", "-1");
    await expect(fireEvent.click(cancel)).toBe(false);
    await expect(canvasElement.querySelector("[data-action-footer=form]")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-action-footer=form]")).toBeInTheDocument();
  },
};

export const SingleColumnEvidenceReview: Story = {
  render: () => <div className="bg-background p-6">
    <FormSection title="Independent evidence review" columns={1}
      description={<><p>Verify the current record and source evidence.</p>
        <p>Reviewing this form does not approve a school opening.</p></>}>
      <Field label="Rationale" required>
        <Textarea minLength={10} placeholder="Document the reviewed evidence."/>
      </Field>
    </FormSection>
  </div>,
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("region", {name:"Independent evidence review"});
    const describedBy = region.getAttribute("aria-describedby");
    await expect(describedBy).toBeTruthy();
    await expect(document.getElementById(describedBy!)?.textContent).toContain("Verify the current record");
    await expect(region.querySelector(".grid-cols-1")).not.toBeNull();
    await expect(within(region).getByRole("textbox", {name:/Rationale/})).toBeRequired();
  },
};

function InlineActionsExample() {
  const [reviewed, setReviewed] = useState(false);
  return <div className="max-w-xl border bg-card p-5">
    <p role="status">{reviewed ? "Reviewed in preview" : "Review pending"}</p>
    <p className="mt-2 text-xs text-muted-foreground">Presentation example only. No approval is recorded.</p>
    <ActionFooter layout="inline">
      <Button type="button" onClick={() => setReviewed(true)}>Mark reviewed in preview</Button>
      <Button type="button" variant="outline" onClick={() => setReviewed(false)}>Reset preview</Button>
    </ActionFooter>
  </div>;
}
export const InlineRecordActions: Story = {
  render: () => <InlineActionsExample/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-action-footer="inline"]')).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-form-actions]')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", {name:"Mark reviewed in preview"}));
    await expect(canvas.getByRole("status")).toHaveTextContent("Reviewed in preview");
    await userEvent.click(canvas.getByRole("button", {name:"Reset preview"}));
    await expect(canvas.getByRole("status")).toHaveTextContent("Review pending");
  },
};
