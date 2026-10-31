import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  invitePublicAdmissionsInterestToApply, listPublicAdmissionsInterests,
  setPublicAdmissionsInterestStatus,
} from "@/modules/enrollment/public-admissions-interest.functions";

type Row = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>[number];

/** These records contain unverified parent-supplied contact data. */
export function PublicInterestInbox({ items }: { items: readonly Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function changeStatus(row: Row, status: "contacted" | "closed") {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      await setPublicAdmissionsInterestStatus({
        data: { interestId: row.id, status },
      });
      setNotice(status === "contacted"
        ? "Contact recorded. This does not verify a guardian or create an Application."
        : "Interest request closed.");
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update interest.");
    } finally {
      setBusyId(null);
    }
  }
  async function inviteToApply(row: Row) {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      await invitePublicAdmissionsInterestToApply({data:{interestId:row.id}});
      setNotice("Verified-email application invitation requested. This does not verify guardianship or create an Application.");
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not invite family to apply.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="mt-8 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Family recruitment and inquiries</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Track family-initiated requests from pre-opening invitations and published school pages.
      Follow-up requires the adult's affirmative consent. Once CAN authorizes
      admissions, send a verified-email application invitation or continue reviewed
      registrar intake. An inquiry never proves guardianship or grants school access.
    </p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    <div className="mt-4 grid gap-3">
      {items.map(row => <article key={row.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{row.firstName} {row.lastName}</h3>
            <p className="text-sm text-muted-foreground">{row.programName}</p>
            <p className="mt-1 text-sm">{row.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()} · {row.status} · {row.source === "staff_invitation" ? "Pre-opening invitation response" : "Public website inquiry"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.applicationId ? <Link to="/admissions/intake"
              search={{siteId:row.siteId,programId:row.programId,
                application:row.applicationId,interest:undefined}}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              View linked inquiry
            </Link> : row.status !== "closed" && <Link to="/admissions/intake"
              search={{siteId:row.siteId,programId:row.programId,
                application:undefined,interest:row.id}}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              Review and create inquiry
            </Link>}
            {!row.applicationId && ["new","contacted"].includes(row.status) &&
              row.canSendApplicationInvitation &&
              <button type="button" disabled={busyId !== null}
                onClick={() => void inviteToApply(row)}
                className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">
                {row.familyStartRequestId ? "Resend expired application link" : "Invite to apply"}
              </button>}
            {row.status === "new" && <button type="button" disabled={busyId !== null}
              onClick={() => void changeStatus(row, "contacted")}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
              Mark contacted
            </button>}
            {row.status !== "closed" && <button type="button" disabled={busyId !== null}
              onClick={() => void changeStatus(row, "closed")}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
              Close
            </button>}
          </div>
        </div>
        <ol className="mt-3 space-y-1 border-l pl-4 text-xs text-muted-foreground" aria-label="Family relationship history">
          {row.invitationBatchId && <li>Pre-opening invitation recorded · Provider receipt does not prove delivery or consent.</li>}
          <li>Family inquiry received · {new Date(row.createdAt).toLocaleString()}</li>
          <li>{row.consentAt
            ? `Follow-up requested by family · ${new Date(row.consentAt).toLocaleString()}`
            : "No affirmative follow-up consent recorded"}</li>
          {row.contactedAt && <li>Registrar follow-up recorded · {new Date(row.contactedAt).toLocaleString()}</li>}
          <li>{row.admissionsAuthorized ? "CAN admissions and school-of-record services authorized" : "Application invitations blocked until CAN authorization"}</li>
          {row.familyStartRequestId && <li>Verified-email application invitation requested · Delivery is not confirmed
            {row.applicationLinkExpiresAt && !row.emailVerifiedAt &&
              (new Date(row.applicationLinkExpiresAt).getTime() <= Date.now() ? " · Link expired" :
                ` · Link expires ${new Date(row.applicationLinkExpiresAt).toLocaleString()}`)}
          </li>}
          {row.emailVerifiedAt && <li>Family verified email link · {new Date(row.emailVerifiedAt).toLocaleString()} (not guardianship)</li>}
          {row.applicationId && <li>Admissions record linked · {row.applicationStage ?? "Inquiry"}{row.applicationSubmittedAt ? ` · ${new Date(row.applicationSubmittedAt).toLocaleString()}` : ""}</li>}
        </ol>
        {row.familyStartRequestId && !row.emailVerifiedAt && !row.applicationId &&
          <p className="mt-2 text-xs text-muted-foreground">Awaiting family email verification or application. A sent invitation is not an accepted application.</p>}
        {!row.admissionsAuthorized && !row.applicationId && row.status !== "closed" &&
          <p className="mt-2 text-xs text-muted-foreground">The family's interest is saved. Application invitations become available after CAN authorizes this school.</p>}
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
      </article>)}
      {items.length === 0 && <p className="text-sm text-muted-foreground">
        No family interest requests in your authorized programs yet.
      </p>}
    </div>
  </section>;
}
