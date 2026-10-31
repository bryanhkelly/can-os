import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";
import { Select } from "./select";

const meta = { title: "Foundations/Form controls" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <div className="grid max-w-xl gap-5 bg-background p-6">
    <div className="space-y-2"><Label htmlFor="story-school">School and program</Label>
      <Select id="story-school" defaultValue="high-school"><option value="high-school">CAN High School</option></Select></div>
    <div className="space-y-2"><Label htmlFor="story-name">Student legal first name</Label>
      <Input id="story-name" placeholder="Enter a legal first name" /></div>
  </div>,
};

export const Validation: Story = {
  render: () => <div className="max-w-xl space-y-2 bg-background p-6">
    <Label htmlFor="story-grade">Entering grade level</Label>
    <Input id="story-grade" defaultValue="Grade nine" aria-invalid="true" aria-describedby="story-grade-error" />
    <p id="story-grade-error" role="alert" className="text-sm text-destructive">Enter a grade using the school's configured grade levels.</p>
  </div>,
};

export const Disabled: Story = {
  render: () => <div className="max-w-xl space-y-2 bg-background p-6">
    <Label htmlFor="story-disabled">Program</Label>
    <Input id="story-disabled" disabled value="Available after school selection" readOnly />
  </div>,
};
