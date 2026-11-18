import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/workspace";
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
    {workspace.isError && <div className="space-y-3 text-sm">
      <p role="status">
        Classroom delivery access could not be verified for this login.
        Your onsite supervision and attendance tools remain separate.
        Ask the Site administrator to check your verified classroom appointment.
      </p>
      <Button type="button" variant="outline" size="sm"
        disabled={workspace.isFetching}
        onClick={() => void workspace.refetch()}>Recheck classroom access</Button>
    </div>}
    {workspace.isSuccess && !authorized && <p role="status" className="text-sm">
      The classroom membership does not match your currently selected Site.
      Use the authorized Site membership rather than switching classroom identities.
    </p>}
    {authorized && <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="text-sm">
        <p><strong>{liveRooms}</strong> live rooms · <strong>{choices}</strong> available course choices</p>
        {choices === 0 && <p className="mt-1 text-muted-foreground">
          No course with an active learner attempt is currently available at this Site.
          Approved rehearsal options are checked independently in the classroom workspace.
        </p>}
      </div>
      <Button asChild size="sm">
        <Link to="/canonical/lab/facilitated">Open facilitated classrooms</Link>
      </Button>
    </div>}
  </WorkspacePanel>;
}
