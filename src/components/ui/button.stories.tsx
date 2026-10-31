import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, LoaderCircle } from "lucide-react";
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
  render: () => <div className="bg-background p-6"><Button disabled aria-busy="true">
    <LoaderCircle aria-hidden="true" className="animate-spin" />Saving changes…
  </Button></div>,
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
