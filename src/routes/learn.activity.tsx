import {createFileRoute, redirect} from "@tanstack/react-router";
import {workspaceSessionQueryOptions} from "@/components/shell/WorkspaceSession";

/** WS00-compatible entry. My Activity retains its existing deep links and nav. */
export const Route = createFileRoute("/learn/activity")({
  loader: async ({context, location}) => {
    const value = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!value.session?.authenticated)
      throw redirect({to: "/access", search: {returnTo: location.href}});
    throw redirect({to: "/learn/my-activity", replace: true});
  },
});
