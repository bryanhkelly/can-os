import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ClassOfferingTermsFields, initialClassOfferingTermsForm } from "./ClassOfferingTermsFields";

const meta = {
  title: "Learning/Shared Class Offering terms",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example() {
  const [draft,setDraft] = useState(() => ({
    ...initialClassOfferingTermsForm,
    methods: [...initialClassOfferingTermsForm.methods],
    creditModes: [...initialClassOfferingTermsForm.creditModes],
  }));
  return <div className="max-w-3xl bg-background p-5">
    <ClassOfferingTermsFields value={draft} onChange={setDraft}
      siteTimeZone="America/Los_Angeles" />
  </div>;
}
export const PrivateAssignmentDraft: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await expect(canvas.getByText("Class Offering terms")).toBeVisible();
    await userEvent.click(canvas.getByRole("checkbox", { name: /Self-enrollment/i }));
    await expect(canvas.getByText("Self-enrollment consent terms")).toBeVisible();
    await expect(canvas.getByLabelText("Participation and data-use terms")).toBeVisible();
  },
};
