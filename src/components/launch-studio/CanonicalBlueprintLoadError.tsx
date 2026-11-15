import { WorkspaceShell } from "@/components/workspace";

/** Canonical permissions share CAN sign-in when staff identity and Site grants are linked. */
export function CanonicalBlueprintLoadError({
  title, message,
}: { title: string; message: string }) {
  return <WorkspaceShell
    eyebrow="CAN OS v3.0.1"
    title={title}
    subtitle="This workspace requires a verified CAN account with the appropriate Site and canonical permissions.">
    <p className="mt-4 border p-4 text-sm" role="alert">{message}</p>
    <p className="mt-3 text-sm text-muted-foreground">
      Your CAN sign-in is shared across workspaces. An independent reviewer must
      connect the school Site and your canonical staff identity before protected
      canonical records can be accessed. Signing in again cannot grant missing permissions.
    </p>
  </WorkspaceShell>;
}
