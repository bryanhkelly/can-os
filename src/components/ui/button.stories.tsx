import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./button";

const meta = {
  title: "Foundations/Button",
  component: Button,
  args: { children: "Continue" },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: args => <div className="flex flex-wrap gap-3 bg-background p-6">
    <Button {...args} />
    <Button {...args} variant="secondary" />
    <Button {...args} variant="outline" />
    <Button {...args} variant="ghost" />
    <Button {...args} variant="destructive">Delete draft</Button>
  </div>,
};

export const Loading: Story = {
  render: () => <div className="bg-background p-6"><Button loading loadingLabel="Saving changes…">Save changes</Button></div>,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Saving changes…" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const KeyboardFocus: Story = {
  render: () => <div className="flex gap-3 bg-background p-6">
    <Button>First action</Button><Button variant="outline">Second action<ArrowRight aria-hidden="true" /></Button>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "First action" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Second action" })).toHaveFocus();
  },
};

export const UnavailableSaveActions: Story = {
  render: () => <div className="flex flex-wrap gap-3 bg-background p-6">
    <Button>Save &amp; Finish</Button>
    <Button disabled>Save &amp; Continue</Button>
    <Button variant="ghost" disabled>Save &amp; Exit</Button>
    <Button asChild disabled><a href="#unavailable">Unavailable link</a></Button>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Save & Finish" })).toBeEnabled();
    const disabled = canvas.getByRole("button", { name: "Save & Continue" });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveClass("bg-muted", "text-muted-foreground");
    await expect(disabled).not.toHaveClass("bg-primary");
    await expect(canvas.getByRole("button", { name: "Save & Exit" })).toBeDisabled();
    const link = canvas.getByRole("link", { name: "Unavailable link" });
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await expect(link).toHaveAttribute("tabindex", "-1");
    await expect(link).toHaveClass("bg-muted");
  },
};
