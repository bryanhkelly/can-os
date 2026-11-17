import { createFileRoute, redirect } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { NoncreditEnrollmentManagement } from "@/components/learning/NoncreditEnrollmentManagement";

/** Existing bookmarks stay functional while My Activity becomes the primary workspace.
 * This page reuses the same commands, not a second registration implementation. */
export const Route = createFileRoute("/learn/my-courses")({
  loader: async ({context,location}) => {
    const value = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!value.session?.authenticated)
      throw redirect({to:"/access",search:{returnTo:location.href}});
  },
  component: () => <WorkspaceShell eyebrow="My CAN" width="wide" title="My Activity"
    subtitle="Manage your existing noncredit training registrations. All participation history is available in My Activity.">
    <NoncreditEnrollmentManagement/>
  </WorkspaceShell>,
});
