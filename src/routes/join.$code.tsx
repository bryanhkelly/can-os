import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { joinClassroomSession } from "@/modules/learning/classroom-join.functions";
import { normalizeClassCode } from "@/domain/classroom-sessions";

export const Route = createFileRoute("/join/$code")({ component: JoinSessionPage });

const DEVICE_KEY_STORAGE = "classroom_device_key";

function deviceKey(): string {
  if (typeof window === "undefined") return "server-rendering";
  let key = window.localStorage.getItem(DEVICE_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY_STORAGE, key);
  }
  return key;
}

function JoinSessionPage() {
  const { code } = Route.useParams();
  const normalized = useMemo(() => normalizeClassCode(code), [code]);
  const [joined, setJoined] = useState<null | { title: string }>(null);

  const join = useMutation({
    mutationFn: () => {
      const device = deviceKey();
      return joinClassroomSession({
        data: {
          code: normalized,
          deviceKey: device,
          // One idempotency key per device per code: retries and refreshes never
          // create a duplicate participant or connection.
          idempotencyKey: `${device}:${normalized}`,
        },
      });
    },
    onSuccess: result => setJoined({ title: result.title }),
  });

  const needsSignIn = join.isError && String(join.error).includes("authenticated");

  return (
    <WorkspaceShell width="reading" eyebrow="Classroom Connect"
      title={joined ? `You're in: ${joined.title}` : `Join class ${normalized}`}
      subtitle={joined
        ? "You are connected to this classroom session. Your responses stay private to you."
        : "Confirm to join the live classroom session on your device."}>
      {joined ? (
        <div className="space-y-4">
          <p role="status">You are connected. Keep this page open during the class.</p>
          <Button asChild variant="outline"><Link to="/">Go to my workspace</Link></Button>
        </div>
      ) : needsSignIn ? (
        <div className="space-y-4">
          <p role="alert">Sign in with your learner account to join this classroom.</p>
          <Button asChild><Link to="/access">Sign in</Link></Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? "Joining…" : "Join classroom"}
          </Button>
          {join.isError && (
            <p role="alert" className="text-sm text-destructive">
              {String(join.error).includes("not valid")
                ? "That class code is not valid or has expired. Check the classroom screen for the current code."
                : "Unable to join right now. Please try again."}
            </p>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
