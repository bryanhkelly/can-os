import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [attempted, setAttempted] = useState(false);
  const titleError = attempted && title.trim().length < 3 ? "Enter a title with at least 3 characters." : undefined;
  const bodyError = attempted && !body.trim() ? "Enter an announcement." : undefined;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (title.trim().length < 3 || !body.trim()) return;
    setAttempted(false);
    onSubmit();
  };
  return <WorkspacePanel title="Post a class announcement"
    description="Visible to enrolled students and academically authorized guardians.">
    <form noValidate className="grid gap-3" onSubmit={submit}>
      <Field label="Title" required error={titleError}>
        <Input minLength={3} maxLength={160} disabled={busy} value={title}
          onChange={event => onTitleChange(event.target.value)} />
      </Field>
      <Field label="Announcement" required error={bodyError}>
        <Textarea maxLength={5000} rows={4} disabled={busy} value={body}
          onChange={event => onBodyChange(event.target.value)} />
      </Field>
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? "Publishing..." : "Publish announcement"}
      </Button>
    </form>
  </WorkspacePanel>;
}
