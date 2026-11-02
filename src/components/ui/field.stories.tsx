import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Checkbox, Radio } from "./choice";
import { Field } from "./field";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";

const meta = {
  title: "Foundations/Fields and choices",
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
