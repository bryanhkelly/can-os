import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Checkbox, Radio } from "./choice";
import { Field } from "./field";
import { Input } from "./input";
import { Select } from "./select";
import { Label } from "./label";
import { Textarea } from "./textarea";

const meta = {
  id: "foundations-fields-and-choices", title: "02 Primitives/Fields and choices",
  parameters: { chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" } } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ disabled = false, error }: { disabled?: boolean; error?: string }) {
  const [confirmed, setConfirmed] = useState(false);
  return <form className="max-w-xl space-y-5 bg-background p-6 text-foreground" onSubmit={event => event.preventDefault()}>
    <Field label="Review reason" required description="Explain the reviewed decision. Do not include private evidence." error={error}>
      <Textarea disabled={disabled} minLength={10}/>
    </Field>
    <Label className="flex items-start gap-3 leading-6">
      <Checkbox disabled={disabled} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
      I reviewed the named operator's handoff and understand that acknowledgment is not an opening approval.
    </Label>
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">Review presentation</legend>
      <Label className="flex items-center gap-3"><Radio name="presentation" value="summary" defaultChecked/>Summary</Label>
      <Label className="flex items-center gap-3"><Radio name="presentation" value="details"/>Details</Label>
    </fieldset>
    <Button disabled={disabled || !confirmed}>Confirm review</Button>
  </form>;
}
export const Default: Story = {
  render: () => <Example/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reason = canvas.getByRole("textbox", { name: /Review reason/ });
    await expect(reason).toBeRequired();
    await expect(reason).toHaveAccessibleDescription("Explain the reviewed decision. Do not include private evidence.");
    await userEvent.click(canvas.getByRole("checkbox"));
    await expect(canvas.getByRole("button", { name: "Confirm review" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("radio", { name: "Details" }));
    await expect(canvas.getByRole("radio", { name: "Details" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Summary" })).not.toBeChecked();
  },
};
export const Validation: Story = {
  render: () => <Example error="Enter at least ten characters explaining the review."/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await expect(canvas.getByRole("textbox")).toHaveAccessibleDescription(
      "Explain the reviewed decision. Do not include private evidence. Enter at least ten characters explaining the review.",
    );
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};
export const Pending: Story = { render: () => <Example disabled/> };
export const LongLabel: Story = {
  render: () => <div className="max-w-sm bg-background p-6">
    <Field label="Name of the independently authorized receiving school operator with responsibility for the current instructional program" required>
      <Input defaultValue="Alexandra Morgan — North Valley Community School"/>
    </Field>
  </div>,
};
export const DarkValidation: Story = {
  globals: { theme: "dark" },
  render: () => <Example error="Enter at least ten characters explaining the review."/>,
};
export const ExplicitControlAssociations: Story = {
  render: () => <div className="max-w-xl space-y-3 bg-background p-6 text-foreground">
    <p id="review-external-help" className="text-sm">Use the reference supplied by your school.</p>
    <Field label="Review reference" description="Reference identifiers are not approval."
      error="Enter the review reference." required>
      <Input id="review-reference" aria-describedby="review-external-help"/>
    </Field>
  </div>,
};

function ControlledReviewExample() {
  const [period, setPeriod] = useState("first");
  const [reason, setReason] = useState("");
  return <div className="grid max-w-xl gap-5 bg-background p-6">
    <p className="text-sm text-muted-foreground">V6.1 control demonstration only. This does not record an approval or grade.</p>
    <Field label="Grading period" required description="Select an authorized period before reviewing.">
      <Select value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="first">Quarter one</option>
        <option value="second">Quarter two</option>
      </Select>
    </Field>
    <Field label="Review rationale" required description="At least ten characters for this preview.">
      <Textarea value={reason} minLength={10} maxLength={500}
        onChange={event => setReason(event.target.value)}/>
    </Field>
    <Button type="button" disabled={reason.trim().length < 10}>Preview reviewed decision</Button>
  </div>;
}
export const ControlledReview: Story = {
  render: () => <ControlledReviewExample/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("combobox", { name: /Grading period/ });
    await userEvent.selectOptions(select, "second");
    await expect(select).toHaveValue("second");
    const reason = canvas.getByRole("textbox", { name: /Review rationale/ });
    const action = canvas.getByRole("button", { name: "Preview reviewed decision" });
    await expect(action).toBeDisabled();
    await userEvent.type(reason, "Independently reviewed current evidence.");
    await expect(action).toBeEnabled();
  },
};

export const ChildRequiredAndDisabledValue: Story = {
  render: () => <div className="max-w-xl space-y-4 bg-background p-6">
    <Field label="Reference"><Input required /></Field>
    <Field label="Recorded reference"><Input disabled value="REF-123" readOnly /></Field>
  </div>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Reference (required)" })).toBeRequired();
    const recorded = canvas.getByRole("textbox", { name: "Recorded reference" });
    await expect(recorded).toBeDisabled();
    await expect(recorded).toHaveValue("REF-123");
    await expect(recorded).toHaveStyle({ opacity: "1" });
  },
};
