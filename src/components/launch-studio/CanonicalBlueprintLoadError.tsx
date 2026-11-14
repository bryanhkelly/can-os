import { WorkspaceShell } from "@/components/workspace";

/**
 * Canonical v3 uses its own session. Never route unauthenticated users
 * into the unrelated public-schema application's sign-in flow.
 */
export function CanonicalBlueprintLoadError({
  title, message,
}: { title: string; message: string }) {
  return <WorkspaceShell
    eyebrow="CAN OS v3.0.1"
    title={title}
    subtitle="This workspace requires an active native canonical account.">
    <p className="mt-4 border p-4 text-sm" role="alert">{message}</p>
    <p className="mt-3 text-sm text-muted-foreground">
      Access is controlled through canonical Organization, Site, and role
      assignments. The earlier application's sign-in cannot grant access here.
    </p>
  </WorkspaceShell>;
}
