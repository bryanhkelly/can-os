import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { WorkspaceShell } from "@/components/workspace";
import { GuardianApplicationForm } from "./GuardianApplicationForm";

const success = fn(async () => ({ applicationId: "application-story-001" }));
const meta = {
  title: "Workflows/GF22 Guardian application",
  component: GuardianApplicationForm,
  args: {
    programs: [{ id: "program-high-school", name: "CAN High School · Grades 9–12",
      schoolYears: [{ id: "school-year-story", name: "2027–2028" }] }],
    households: [{ id: "household-story", name: "Synthetic family household" }],
    onSubmit: success,
    onSubmitted: fn(),
  },
  decorators: [Story => <WorkspaceShell eyebrow="CAN OS · Family" title="Apply to a school"
    subtitle="Story data is synthetic. Production uses the canonical guardian loader and command."><Story /></WorkspaceShell>],
} satisfies Meta<typeof GuardianApplicationForm>;
export default meta;
type Story = StoryObj<typeof meta>;

async function fillRequiredFields(canvas: ReturnType<typeof within>) {
  await userEvent.selectOptions(canvas.getByLabelText("Application academic year"), "school-year-story");
  await userEvent.type(canvas.getByLabelText("Student legal first name"), "Jordan");
  await userEvent.type(canvas.getByLabelText("Student legal last name"), "Lee");
  await userEvent.type(canvas.getByLabelText("Entering grade level"), "9");
}

export const Ready: Story = {};

export const RequiredFieldValidation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
    const firstName = canvas.getByLabelText("Student legal first name") as HTMLInputElement;
    await expect(firstName.validity.valueMissing).toBe(true);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const SuccessfulSubmission: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await fillRequiredFields(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
    await expect(args.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      programId: "program-high-school", studentFirstName: "Jordan", studentLastName: "Lee", gradeLevel: "9",
    }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Application received (application-story-001)");
  },
};

export const Loading: Story = {
  args: { onSubmit: fn(() => new Promise<{ applicationId: string }>(() => {})) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await fillRequiredFields(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
    await expect(canvas.getByRole("button", { name: "Submitting application…" })).toBeDisabled();
    await expect(canvas.getByLabelText("Student legal first name")).toBeDisabled();
  },
};

export const ServerError: Story = {
  args: { onSubmit: fn(async () => { throw new Error("The application could not be saved. Try again."); }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await fillRequiredFields(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("The application could not be saved. Try again.");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};

export const NoEligiblePrograms: Story = {
  args: { programs: [], households: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("No eligible school is currently available");
    await expect(canvas.queryByRole("button", { name: "Submit application" })).not.toBeInTheDocument();
  },
};


function ProgramDeepLinkHarness() {
  const [requestedProgramId, setRequestedProgramId] = useState("program-one");
  return <div>
    <button type="button" onClick={() => setRequestedProgramId("program-two")}>Switch program deep link</button>
    <GuardianApplicationForm
      programs={[{ id: "program-one", name: "Program One" }, { id: "program-two", name: "Program Two" }]}
      households={[]}
      requestedProgramId={requestedProgramId}
      onSubmit={async () => ({ applicationId: "test-only" })}
    />
  </div>;
}

export const ProgramDeepLinkChange: Story = {
  render: () => <ProgramDeepLinkHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("School and program") as HTMLSelectElement;
    await expect(select).toHaveValue("program-one");
    await userEvent.click(canvas.getByRole("button", { name: "Switch program deep link" }));
    await waitFor(() => expect(select).toHaveValue("program-two"));
  },
};
