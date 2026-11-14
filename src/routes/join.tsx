import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classroomJoinPath } from "@/domain/classroom-connect";

export const Route = createFileRoute("/join")({ component: JoinClassroomPage });

function JoinClassroomPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const path = classroomJoinPath(code);
      setError("");
      void navigate({ to: path });
    } catch {
      setError("Enter the 10-character pairing code displayed by the facilitator.");
    }
  }
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Join a classroom" subtitle="Pair your own device to a facilitator-led course.">
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="classroom-pair-code">Pairing code</label>
      <Input id="classroom-pair-code" value={code} maxLength={15} autoComplete="off"
        autoCapitalize="characters" spellCheck={false}
        aria-describedby={error ? "classroom-pair-error" : undefined}
        placeholder="XXXXX-XXXXX" onChange={event => setCode(event.target.value.toUpperCase())}
        className="font-mono text-xl tracking-wider" />
      {error && <p id="classroom-pair-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Continue</Button>
    </form>
  </WorkspaceShell>;
}
