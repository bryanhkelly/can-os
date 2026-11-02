import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, waitFor, fireEvent } from "storybook/test";
import { SiteProgramFields } from "./site-program-fields";
import { MutationFeedback } from "./mutation-feedback";
import { LocalDateTimeField } from "./local-datetime-field";
import { ActionDialog } from "./action-dialog";
import { FileSelectionField, UploadedFileNotice } from "@/components/evidence/FileSelectionField";
import { QueryState } from "./query-state";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const meta = { title: "Foundations/Reusable workflow controls",
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function ScopeExample() {
  const [siteId, setSiteId] = useState("west");
  const [programId, setProgramId] = useState("west-program");
  return <SiteProgramFields sites={[{ id: "west", name: "West school" }, { id: "east", name: "East school" }]}
    programs={[{ id: "west-program", name: "West program", siteId: "west" }, { id: "east-program", name: "East program", siteId: "east" }]}
    siteId={siteId} programId={programId} sitePlaceholder="All permitted schools" programPlaceholder="All permitted programs"
    onChange={(site, program) => { setSiteId(site); setProgramId(program); }} />;
}
export const ScopeSelection: Story = {
  render: () => <ScopeExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Program")).toHaveValue("west-program");
    await userEvent.selectOptions(canvas.getByLabelText("School"), "east");
    await expect(canvas.getByLabelText("Program")).toHaveValue("");
    await expect(canvas.queryByRole("option", { name: "West program" })).not.toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByLabelText("Program"), "east-program");
    await expect(canvas.getByLabelText("Program")).toHaveValue("east-program");
    await userEvent.selectOptions(canvas.getByLabelText("School"), "");
    await expect(canvas.getByRole("option", { name: "West program" })).toBeInTheDocument();
  },
};

function DialogExample({ pending = false }: { pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState(0);
  return <>
    <Button onClick={() => setOpen(true)}>Review decision</Button>
    <p>Confirmed: {count}</p>
    <ActionDialog open={open} title="Review decision" description="Provide a reason before confirming."
      confirmLabel="Confirm decision" pending={pending} onClose={() => setOpen(false)}
      onConfirm={() => { setCount(value => value + 1); setOpen(false); }}>
      <Label>Reason<Textarea required minLength={5} value={reason} onChange={event => setReason(event.target.value)} /></Label>
    </ActionDialog>
  </>;
}
export const ReasonDialog: Story = {
  render: () => <DialogExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Review decision" });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Review decision" });
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm decision" }));
    await expect(canvas.getByText("Confirmed: 0")).toBeInTheDocument();
    // Synthetic Escape events do not invoke the browser's native dialog cancel action.
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Reviewed evidence");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm decision" }));
    await expect(canvas.getByText("Confirmed: 1")).toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};
export const PendingDialog: Story = {
  render: () => <DialogExample pending />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Review decision" }));
    const dialog = canvas.getByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(within(dialog).getByLabelText("Reason")).toBeDisabled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await expect(dialog).toBeVisible();
    await expect(canvas.getByText("Confirmed: 0")).toBeInTheDocument();
  },
};

function DeclineExample() {
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)} disabled={declined}>Decline offer</Button>
    {declined && <p role="status">Offer declined. Your school has been notified.</p>}
    <ActionDialog open={open} title="Decline school offer?" destructive confirmLabel="Decline offer"
      description="The school will be notified and you may need to contact admissions to reapply."
      onClose={() => setOpen(false)} onConfirm={() => { setDeclined(true); setOpen(false); }}/>
  </>;
}
export const DestructiveConfirmation: Story = { render: () => <DeclineExample/> };

function DateTimeExample() {
  const [value, setValue] = useState("2027-01-15T09:30");
  return <LocalDateTimeField label="Departure" timezone="America/Los_Angeles" value={value} onChange={setValue} required />;
}
export const ExplicitTimezone: Story = {
  render: () => <DateTimeExample />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText("Departure (America/Los_Angeles)");
    await expect(field).toHaveValue("2027-01-15T09:30");
    fireEvent.change(field, { target: { value: "2027-07-15T10:00" } });
    await expect(field).toHaveValue("2027-07-15T10:00");
  },
};

function FileExample() {
  const [file, setFile] = useState<File | null>(null);
  return <FileSelectionField label="Private evidence" file={file} onChange={setFile} accept="application/pdf" />;
}
export const FileSelection: Story = {
  render: () => <FileExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText("Private evidence") as HTMLInputElement;
    await userEvent.upload(field, new File(["isolated fixture"], "evidence.pdf", { type: "application/pdf" }));
    await expect(canvas.getByText("Selected: evidence.pdf")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Clear file" }));
    await expect(field.value).toBe("");
    await expect(canvas.queryByText("Selected: evidence.pdf")).not.toBeInTheDocument();
    await userEvent.upload(field, new File(["isolated fixture"], "evidence.pdf", { type: "application/pdf" }));
    await expect(canvas.getByText("Selected: evidence.pdf")).toBeInTheDocument();
  },
};
export const SavedButRefreshFailed: Story = {
  render: () => <MutationFeedback state={{ pending: false, error: "Reopen the page to review the saved record.",
    notice: "Saved", refreshFailed: true }} pendingMessage="Saving..."
    successAction={<a href="#saved">Open saved record</a>} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("The command succeeded.");
    await expect(canvas.queryByText("No change was completed.")).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open saved record" })).toBeInTheDocument();
  },
};
export const UploadedNotRecorded: Story = { render: () => <UploadedFileNotice /> };

function RefreshRecoveryExample() {
  const [commands, setCommands] = useState(0);
  const [refreshes, setRefreshes] = useState(0);
  const mutation = useMutationFeedback(async () => {
    setRefreshes(value => value + 1);
    if (refreshes < 2) throw new Error("Isolated refresh outage");
  });
  return <>
    <Button disabled={mutation.pending || mutation.refreshFailed}
      onClick={() => void mutation.run(async () => { setCommands(value => value + 1); }, {
        successMessage: "Request saved.", commandErrorMessage: "Request failed.",
      })}>Save request</Button>
    <p>Commands: {commands}</p>
    <p>Refreshes: {refreshes}</p>
    <MutationFeedback state={mutation} pendingMessage="Saving request..."/>
  </>;
}
export const RetrySavedRefresh: Story = {
  render: () => <RefreshRecoveryExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save request" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Request saved.");
    await expect(canvas.getByRole("button", { name: "Save request" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Retry refresh" }));
    await expect(canvas.getByRole("alert")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save request" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Retry refresh" }));
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(canvas.getByText("Commands: 1")).toBeInTheDocument();
    await expect(canvas.getByText("Refreshes: 3")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save request" })).toBeEnabled();
  },
};
export const DarkRefreshRecovery: Story = {
  globals: { theme: "dark" },
  render: () => <RefreshRecoveryExample/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save request" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Request saved.");
    await expect(canvas.getByRole("button", { name: "Retry refresh" })).toBeVisible();
  },
};

function QueryExample() {
  const [failed, setFailed] = useState(true);
  return <QueryState error={failed ? "Records could not load" : undefined} onRetry={() => setFailed(false)}>
    <p>Authorized records</p>
  </QueryState>;
}
export const RetryQuery: Story = {
  render: () => <QueryExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("Authorized records")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(canvas.getByText("Authorized records")).toBeInTheDocument();
  },
};
