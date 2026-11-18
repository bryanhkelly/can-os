import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WorkspacePanel, WorkspaceNotice, StatusBadge } from "@/components/workspace";
import { getFacilitatedHostWorkspace } from "@/modules/learning/facilitated-learning.functions";

/**
 * A Site-day shortcut is not a classroom grant. Show the entry action only
 * after the authoritative canonical room reader validates the active session,
 * Site and facilitator rights. All room commands recheck those rights.
 */
export function FacilitatedClassroomEntry({ siteId }: { siteId: string }) {
  const workspace = useQuery({
    queryKey: ["site-day-classroom-authority", siteId],
    queryFn: () => getFacilitatedHostWorkspace(),
    retry: false,
    staleTime: 30_000,
  });
  const authorized = workspace.isSuccess && workspace.data.siteId === siteId;
  const choices = authorized
    ? workspace.data.choices.filter(choice => choice.siteId === siteId).length : 0;
  const liveRooms = authorized
    ? workspace.data.rooms.filter(room => room.siteId === siteId && room.state === "live").length : 0;

  return <WorkspacePanel title="Facilitated classrooms"
    className="mt-4"
    description="Prepare or run supervised learning with approved course content. Classroom device pairing and activity do not establish physical attendance.">
    {workspace.isPending && <p role="status" className="text-sm text-muted-foreground">
      Verifying current classroom permissions…
    </p>}
    {workspace.isError && <WorkspaceNotice tone="attention" className="mt-2">
      <p role="status">
        Classroom delivery access could not be verified for this login.
        Your onsite supervision and attendance tools remain separate.
        Ask the Site administrator to check your verified classroom appointment.
      </p>
      <Button type="button" variant="outline" size="sm"
        disabled={workspace.isFetching}
        onClick={() => void workspace.refetch()}>Recheck classroom access</Button>
    </WorkspaceNotice>}
    {workspace.isSuccess && !authorized && <p role="status" className="text-sm">
      The classroom membership does not match your currently selected Site.
      Use the authorized Site membership rather than switching classroom identities.
    </p>}
    {authorized && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2 text-sm">
          <StatusBadge tone={choices ? "info" : "attention"}>
            {choices ? "Authorized Course choices available" : "No Course eligible to start"}
          </StatusBadge>
          <p><strong>{liveRooms}</strong> live rooms · <strong>{choices}</strong> available course choices</p>
        </div>
        <Button asChild size="sm">
          <Link to="/canonical/lab/facilitated">Open facilitated classrooms</Link>
        </Button>
      </div>
      {choices === 0 && <WorkspaceNotice tone="attention">
        <p>No published Course with an active learner attempt is available through an
          authorized active deployment at this Site. Your Site administrator should
          verify the deployment, published Course and learner participation before
          scheduling a live learning room. Approved media rehearsal is checked separately.</p>
        <p className="mt-2">Physical room coverage, qualified backup staff, supervision and
          verified onsite attendance remain separate requirements. Opening this workspace
          does not approve a school day or establish presence.</p>
      </WorkspaceNotice>}
    </div>}
  </WorkspacePanel>;
}
