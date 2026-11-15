import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FacilitatedRoomPlayer } from "@/components/learning/FacilitatedRoomPlayer";
import { getClassroomHostActivity } from "@/modules/learning/classroom-evidence.functions";
import { Button } from "@/components/ui/button";

/** Standalone projector view; facilitator authorization is checked on every request. */
export const Route = createFileRoute("/classroom/$sessionId/presentation")({
  head:()=>({meta:[{name:"referrer",content:"no-referrer"}]}),
  component:ClassroomPresentation,
});
function ClassroomPresentation(){
  const {sessionId}=Route.useParams();
  const room=useQuery({
    queryKey:["classroom-presentation",sessionId],
    queryFn:()=>getClassroomHostActivity({data:{facilitatedSessionId:sessionId}}),
    refetchInterval:8000,retry:false,
  });
  const active=room.data?.releases.find(item=>!item.closed);
  return <main className="min-h-screen bg-background px-4 py-6 md:px-10">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div><p className="text-xs uppercase tracking-widest text-muted-foreground">CAN OS · Classroom Connect</p>
        <h1 className="font-serif text-3xl font-semibold">Shared-screen classroom</h1>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={()=>void document.documentElement.requestFullscreen?.()}>Full screen</Button>
        <Button asChild variant="outline"><Link to="/canonical/lab/facilitated">Facilitator console</Link></Button>
      </div>
    </header>
    {room.isPending&&<p role="status" className="mt-6">Checking facilitator permission…</p>}
    {room.isError&&<p role="alert" className="mt-6">This presentation is unavailable or you do not have current facilitator access.</p>}
    {room.data&&<div className="mx-auto mt-6 max-w-6xl">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div><FacilitatedRoomPlayer facilitatedSessionId={sessionId}/></div>
        <aside className="border border-border bg-card p-5" aria-label="Current classroom activity">
          <h2 className="font-serif text-2xl font-semibold">Current activity</h2>
          {active?<div className="mt-4">
            <p className="text-lg font-medium">{active.prompt}</p>
            {active.answerType==="single_choice"&&<ol className="mt-4 list-inside list-decimal space-y-3">
              {active.choices.map((choice,i)=><li key={i}>{choice}</li>)}
            </ol>}
            <p className="mt-4 text-sm text-muted-foreground">Respond on your own paired device.</p>
          </div>:<p className="mt-4 text-sm text-muted-foreground">Waiting for a question from the facilitator.</p>}
          <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
            No learner names, answers or attendance records are projected.
          </p>
        </aside>
      </div>
    </div>}
  </main>;
}
