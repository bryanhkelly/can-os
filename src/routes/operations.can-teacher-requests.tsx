import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import {
  listCANTeacherStaffingInbox, reviewCANTeacherStaffingRequest,
} from "@/modules/staffing/can-teacher-staffing-inbox.functions";

export const Route = createFileRoute("/operations/can-teacher-requests")({
  loader: () => safeLoader(() => listCANTeacherStaffingInbox(), {
    authMessage: "CAN academic provider staffing administrators only.",
  })(),
  component: CANTeacherRequestsPage,
});

function CANTeacherRequestsPage() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  if (!result.ok) return <LoaderFailure title="CAN staffing requests" outcome={result} />;

  async function review(requestId: string, decision: "begin_review" | "decline") {
    if (active) return;
    setActive(requestId); setNotice(""); setError("");
    try {
      await reviewCANTeacherStaffingRequest({ data: {
        requestId, decision, reason: decision === "decline" ? (reasonById[requestId] ?? "").trim() : "",
      } });
      await router.invalidate();
      setNotice(decision === "decline"
        ? "Staffing request declined and recorded."
        : "CAN review started. No teacher assignment has been made.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the staffing request.");
    } finally {
      setActive(null);
    }
  }

  const requests = result.data.requests;
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN Academy · Academic staffing</p>
    <h1 className="font-serif text-4xl">School teacher requests</h1>
    <p className="max-w-3xl text-sm text-muted-foreground">
      Review requests from schools served by your authorized academic provider.
      Starting review does not accept an assignment, confirm teacher capacity, or verify credentials.
    </p>
    {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    <p className="text-sm font-medium">{requests.length} open staffing requests</p>
    {!requests.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">
      There are no pending school teacher requests for your academic provider.
    </p>}
    {requests.map(request => <article key={request.requestId} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">{request.programName}</h2>
          <p className="mt-1 font-medium">{request.teacherName}
            {request.isSynthetic && <span className="ml-2 text-xs font-normal text-muted-foreground">Sample profile</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Course version: {request.courseVersionId} · {request.sectionId ? "Individual class" : "Course-level request"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {request.reviewState === "in_review" ? "CAN review in progress" : "Awaiting CAN review"}
            {" · "}Requested {new Date(request.requestedAt).toLocaleDateString()}
          </p>
        </div>
        {request.reviewState === "requested" && <Button type="button"
          disabled={active !== null} onClick={() => void review(request.requestId, "begin_review")}>
          {active === request.requestId ? "Saving…" : "Start CAN review"}
        </Button>}
      </div>
      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Decline request</summary>
        <form className="mt-3 space-y-2" onSubmit={event => {
          event.preventDefault();
          void review(request.requestId, "decline");
        }}>
          <label className="block text-sm">
            Reason (required)
            <textarea className="mt-1 block w-full rounded-lg border bg-background p-2"
              rows={2} required minLength={8} maxLength={1000}
              value={reasonById[request.requestId] ?? ""}
              onChange={event => setReasonById(old => ({ ...old, [request.requestId]: event.target.value }))} />
          </label>
          <Button type="submit" variant="outline"
            disabled={active !== null || (reasonById[request.requestId]?.trim().length ?? 0) < 8}>
            Decline and record reason
          </Button>
        </form>
      </details>
    </article>)}
  </main>;
}
