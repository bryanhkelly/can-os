import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ClassParticipationAcknowledgments } from "./ClassParticipationAcknowledgments";

const meta = {
  id: "learning-shared-class-participation", title: "08 Feature workspaces/Learning/Class participation",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example() {
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  return <div className="max-w-xl border bg-card p-5">
    <ClassParticipationAcknowledgments
      adultChecked={adult} consentChecked={terms}
      onAdultChange={setAdult} onConsentChange={setTerms}
      adultLabel="I confirm that I am at least 18."
      consentLabel="I accept the published terms of participation."
    />
    <p role="status" className="mt-4 text-sm">
      Acknowledged: {adult && terms ? "both" : "incomplete"}
    </p>
  </div>;
}

export const IndependentAcknowledgments: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const age = canvas.getByRole("checkbox", { name: /at least 18/i });
    const terms = canvas.getByRole("checkbox", { name: /published terms/i });
    await userEvent.click(age);
    await expect(age).toBeChecked();
    await expect(terms).not.toBeChecked();
    await userEvent.click(terms);
    await expect(canvas.getByText("Acknowledged: both")).toBeVisible();
  },
};
