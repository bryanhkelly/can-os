import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from "@tanstack/react-router";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import { LaunchStudioChrome, LaunchStudioShell, LaunchStudioStepContent } from "./LaunchStudioShell";
import { useLaunchDraftChanges, useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";
import { StudentProfileEditor, type StudentProfileFields } from "@/components/profiles/StudentProfileSetup";
import { QualificationRecords } from "@/components/profiles/Qualifications";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LaunchDraftButton } from "./LaunchDraftButton";
import { saveLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";

const meta = {
  title: "Workflows/Launch Studio audience forms",
  parameters: { layout: "fullscreen" },
  decorators: [Story => {
    const root = createRootRoute({ component: Outlet });
    const launch = createRoute({ getParentRoute: () => root, path: "/launch", component: Story });
    const home = createRoute({ getParentRoute: () => root, path: "/home", component: () => <p>Fixture dashboard</p> });
    const router = createRouter({ routeTree: root.addChildren([launch, home]),
      history: createMemoryHistory({ initialEntries: ["/launch"] }) });
    return <RouterProvider router={router} />;
  }],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const steps = [{ id: "details", title: "Your details" }, { id: "next", title: "What's next" }];
const submitApplication = fn(async () => ({ applicationId: "fixture-application" }));
const submitProfile = fn(async () => ({ saved: true }));

function DraftBuffer() {
  const [name, setName] = useState("");
  const changes = useLaunchDraftChanges(name);
  useLaunchUnsavedChanges(changes.dirty);
  return <LaunchStudioChrome><LaunchStudioShell role="Student setup" subject="Isolated draft"
    title="Save your preparation." steps={steps} currentId="details" onStepChange={() => {}}
    exit={<Link to="/home">Skip to dashboard</Link>}
    saveAction={<LaunchDraftButton selection={{ audience: "student", context: "" }} initial={null}
      value={() => ({ audience: "student", fields: { preferredName: name, pronouns: "", interests: "", courseIds: [] } })}
      onSaved={value => { if (value.audience === "student") changes.markSaved(value.fields.preferredName); }} />}>
    <Field label="Preferred name"><Input value={name} onChange={event => setName(event.target.value)} /></Field>
  </LaunchStudioShell></LaunchStudioChrome>;
}

function AudienceForm({ audience }: { audience: "parent" | "student" | "staff" }) {
  const [step, setStep] = useState("details");
  const [fields, setFields] = useState<StudentProfileFields>({ preferredName: "", pronouns: "", interests: "" });
  const [qualificationDirty, setQualificationDirty] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const changes = useLaunchDraftChanges(fields);
  useLaunchUnsavedChanges(audience === "student" ? changes.dirty || profileBusy : audience === "staff" && qualificationDirty);
  return <LaunchStudioChrome><LaunchStudioShell role={`${audience} setup`} subject="Isolated example"
    title="Prepare your next beginning." steps={steps} currentId={step} onStepChange={setStep}
    status={<p>Isolated fixture. Save draft keeps entries; submit sends information for review.</p>}
    exit={<Link to="/home">Skip to dashboard</Link>}
    actions={<>
      <Button variant="outline" disabled={step === "details"} onClick={() => setStep("details")}>Back</Button>
      {step === "details" && <Button onClick={() => setStep("next")}>Continue</Button>}
    </>}>
    <LaunchStudioStepContent active={step === "details"}>
      {audience === "parent" ? <GuardianApplicationForm embedded
        programs={[{ id: "school", name: "Example Academy", schoolYears: [{ id: "year", name: "2027-2028" }] }]}
        households={[{ id: "family", name: "Example family" }]} onSubmit={submitApplication} /> :
        audience === "student" ? <section className="border bg-card p-5">
          <StudentProfileEditor embedded snapshot={{ preferredName: "", preferredPronouns: "", interests: [] }}
            fields={fields} onFieldsChange={setFields} onBusyChange={setProfileBusy}
            onSaved={value => { setFields(value); changes.markSaved(value); }} saveProfile={submitProfile}
            changed={async () => {}} />
        </section> : <section className="border bg-card p-5">
          <h2 className="font-serif text-2xl">Your qualifications</h2>
          <p className="mt-3 text-sm">Notes drafts do not include these fields or files. Submit evidence for review before leaving.</p>
          <QualificationRecords embedded onDirtyChange={setQualificationDirty}
            snapshot={{ personId: "staff", canSubmit: true, canReview: false, uploadsEnabled: true,
              hasMore: false, catalog: [{ id: "resume", title: "Resume" }], jurisdictions: [], claims: [] }}
            selection={{}} changed={async () => {}} />
        </section>}
    </LaunchStudioStepContent>
    {step === "next" && <section className="border bg-card p-5"><h2 className="font-serif text-2xl">Your school guides the next step</h2>
      <p className="mt-3 text-sm">Continue doesn't submit your information or approve your readiness.</p></section>}
  </LaunchStudioShell></LaunchStudioChrome>;
}

async function checkRetainedStep(canvas: ReturnType<typeof within>) {
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
  await expect(canvas.getByRole("heading", { name: "Your school guides the next step" })).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Back" }));
}
async function checkBlockedExit(canvas: ReturnType<typeof within>) {
  const previous = window.confirm;
  const confirm = fn(() => false);
  window.confirm = confirm;
  try {
    await userEvent.click(canvas.getByRole("link", { name: "Skip to dashboard" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await expect(canvas.queryByText("Fixture dashboard")).not.toBeInTheDocument();
  } finally { window.confirm = previous; }
}
export const DraftSaveKeepsLaterEdits: Story = {
  render: () => <DraftBuffer />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = mocked(saveLaunchStudioDraft);
    let complete: (() => void) | undefined;
    save.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { complete = resolve; });
      return { revision: 1, savedAt: "2026-11-05T12:00:00.000Z" };
    });
    try {
      await userEvent.type(canvas.getByLabelText("Preferred name"), "Before save");
      await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      await userEvent.clear(canvas.getByLabelText("Preferred name"));
      await userEvent.type(canvas.getByLabelText("Preferred name"), "Later edit");
      expect(complete).toBeDefined();
      complete!();
      await expect(await canvas.findByRole("status")).toHaveTextContent("Draft saved");
      await expect(save).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
        value: expect.objectContaining({ fields: expect.objectContaining({ preferredName: "Before save" }) }),
      }) }));
      await expect(canvas.getByLabelText("Preferred name")).toHaveValue("Later edit");
      await checkBlockedExit(canvas);
    } finally { complete?.(); save.mockReset(); }
  },
};
export const ParentApplication: Story = {
  render: () => <AudienceForm audience="parent" />,
  play: async ({ canvasElement }) => {
    submitApplication.mockClear();
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText(/School year/), "year");
    await userEvent.type(canvas.getByLabelText(/Student legal first name/), "Fixture");
    await userEvent.type(canvas.getByLabelText(/Student legal last name/), "Learner");
    await userEvent.type(canvas.getByLabelText(/Entering grade level/), "9");
    await checkRetainedStep(canvas);
    await expect(canvas.getByLabelText(/Student legal first name/)).toHaveValue("Fixture");
    await expect(submitApplication).not.toHaveBeenCalled();
    await checkBlockedExit(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Application received");
    await expect(submitApplication).toHaveBeenCalledTimes(1);
  },
};
export const StudentProfile: Story = {
  render: () => <AudienceForm audience="student" />,
  play: async ({ canvasElement }) => {
    submitProfile.mockClear();
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/Preferred name/), "New name");
    await checkRetainedStep(canvas);
    await expect(canvas.getByLabelText(/Preferred name/)).toHaveValue("New name");
    await checkBlockedExit(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Save student profile" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Student profile saved");
    await expect(submitProfile).toHaveBeenCalledTimes(1);
    const previous = window.confirm;
    const confirm = fn(() => false);
    window.confirm = confirm;
    try {
      await userEvent.click(canvas.getByRole("link", { name: "Skip to dashboard" }));
      await expect(await canvas.findByText("Fixture dashboard")).toBeVisible();
      await expect(confirm).not.toHaveBeenCalled();
    } finally { window.confirm = previous; }
  },
};
export const StaffQualification: Story = {
  render: () => <AudienceForm audience="staff" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/Issuing institution/), "Example College");
    const file = new File(["isolated fixture"], "fixture-resume.pdf", { type: "application/pdf" });
    await userEvent.upload(canvas.getByLabelText(/Evidence \(PDF/), file);
    await checkRetainedStep(canvas);
    await expect(canvas.getByLabelText(/Issuing institution/)).toHaveValue("Example College");
    const input = canvas.getByLabelText(/Evidence \(PDF/) as HTMLInputElement;
    await expect(input.files?.[0]?.name).toBe("fixture-resume.pdf");
    await checkBlockedExit(canvas);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
