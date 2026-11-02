import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkflowIntro } from "./workflow-intro";

const meta = {
  title: "Foundations/Workflow introduction",
  component: WorkflowIntro,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WorkflowIntro>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SchoolLaunch: Story = {
  args: {
    eyebrow: "School launch · Readiness",
    title: "Build a school with confidence.",
    description: "Coordinate the host site, academic provider and program launch. Recorded progress is not permission to open.",
  },
  render: args => <div className="min-h-screen bg-background p-4 sm:p-8"><WorkflowIntro {...args} /></div>,
};

export const WithActions: Story = {
  args: {
    eyebrow: "Admissions & enrollment",
    title: "A thoughtful path from inquiry to enrollment.",
    description: "Track each family's progress and hand accepted offers into authorized enrollment.",
    actions: <><a href="#intake" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Open intake</a><a href="#capacity" className="inline-flex min-h-11 items-center rounded-xl border bg-background px-4 text-sm font-semibold">Review capacity</a></>,
  },
  render: args => <div className="min-h-screen bg-background p-4 sm:p-8"><WorkflowIntro {...args} /></div>,
};
