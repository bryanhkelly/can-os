import {createFileRoute, redirect} from "@tanstack/react-router";
import {workspaceSessionQueryOptions} from "@/components/shell/WorkspaceSession";

/** Compatibility redirect: registered activity lives at /learn/my-activity.
 * No enrollment or history is changed by navigation. */
export const Route = createFileRoute("/learn/my-programs")({
  loader: async ({context, location}) => {
    const value = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!value.session?.authenticated)
      throw redirect({to: "/access", search: {returnTo: location.href}});
    throw redirect({to: "/learn/my-activity", replace: true});
  },
});
