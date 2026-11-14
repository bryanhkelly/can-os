import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  CLASS_CODE_LENGTH,
  isValidClassCode,
  joinPathForCode,
  normalizeClassCode,
} from "@/domain/classroom-sessions";

export const Route = createFileRoute("/join")({ component: JoinClassroomPage });

/** Keyboard-accessible entry point: join by typed code, not QR only. */
function JoinClassroomPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeClassCode(value);
    if (!isValidClassCode(code)) {
      setError(`Enter the ${CLASS_CODE_LENGTH}-character class code shown on the classroom screen.`);
      return;
    }
    setError(null);
    void navigate({ to: joinPathForCode(code) });
  };

  return (
    <WorkspaceShell width="reading" eyebrow="Classroom Connect" title="Join a classroom"
      subtitle="Enter the class code shown on the classroom screen. You can also scan the QR code with your phone.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Class code">
          <Input
            value={value}
            onChange={event => setValue(event.target.value.toUpperCase())}
            placeholder="e.g. ABC234"
            maxLength={CLASS_CODE_LENGTH + 4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-describedby={error ? "class-code-error" : undefined}
            className="text-center font-mono text-2xl tracking-widest"
          />
        </Field>
        {error && <p id="class-code-error" role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit">Continue</Button>
      </form>
    </WorkspaceShell>
  );
}
