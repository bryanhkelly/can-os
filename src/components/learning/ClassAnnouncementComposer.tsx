import type { FormEvent } from "react";
import { WorkspacePanel } from "@/components/workspace";

export function ClassAnnouncementComposer({
  title, body, busy, onTitleChange, onBodyChange, onSubmit,
}: {
  title: string;
  body: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  return <WorkspacePanel title="Post a class announcement"
    description="Visible to enrolled students and academically authorized guardians.">
    <form className="grid gap-3" onSubmit={submit}>
      <label className="text-sm">Title
        <input maxLength={160} disabled={busy} value={title} onChange={event => onTitleChange(event.target.value)}
          className="mt-2 block w-full rounded-lg border bg-background p-3"/>
      </label>
      <label className="text-sm">Announcement
        <textarea maxLength={5000} rows={4} disabled={busy} value={body}
          onChange={event => onBodyChange(event.target.value)}
          className="mt-2 block w-full rounded-lg border bg-background p-3"/>
      </label>
      <button disabled={busy || title.trim().length < 3 || !body.trim()}
        className="justify-self-start rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
        {busy ? "Publishing..." : "Publish announcement"}
      </button>
    </form>
  </WorkspacePanel>;
}
