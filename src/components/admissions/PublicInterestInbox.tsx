import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  invitePublicAdmissionsInterestToApply, listPublicAdmissionsInterests,
  setPublicAdmissionsInterestStatus,
} from "@/modules/enrollment/public-admissions-interest.functions";

type Page = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>;
type Row = Page["items"][number];

/** These records contain unverified parent-supplied contact data. */
export function PublicInterestInbox({ initialPage, siteId, programId }: {
  initialPage: Page; siteId?: string; programId?: string;
}) {
  const router = useRouter();
  const [olderRows,setOlderRows] = useState<Row[]>([]);
  const [nextCursor,setNextCursor] = useState<string|null>(initialPage.nextCursor);
  const [loadingMore,setLoadingMore] = useState(false);
  const [loadError,setLoadError] = useState("");
  useEffect(() => {
    setOlderRows([]);
    setNextCursor(initialPage.nextCursor);
  }, [initialPage]);
  const seen = new Set<string>();
  const items = [...initialPage.items,...olderRows].filter(row => {
    if ((siteId&&row.siteId!==siteId)||(programId&&row.programId!==programId)||
      seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);setLoadError("");
    try {
      const page=await listPublicAdmissionsInterests({data:{cursor:nextCursor}});
      setOlderRows(current=>[...current,...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Unable to load older inquiries.");
    } finally {setLoadingMore(false);}
  }
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
            </Link> : row.status !== "closed" && row.admissionsAuthorized && <Link to="/admissions/intake"
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
            {["new", "contacted"].includes(row.status) && <button type="button" disabled={busyId !== null}
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
          {row.latestOfferStatus && <li>Admissions offer: {row.latestOfferStatus}
            {row.latestOfferIssuedAt ? ` · Issued ${new Date(row.latestOfferIssuedAt).toLocaleString()}` : ""}
            {row.latestOfferRespondedAt ? ` · Guardian responded ${new Date(row.latestOfferRespondedAt).toLocaleString()}` : ""}
          </li>}
          {row.applicationId && <li>{row.activeEnrollment
            ? "School-year enrollment activated"
            : "School-year enrollment not yet active"}</li>}
          {row.activeEnrollment && <li>{row.placedInClass
            ? "Active instructional class placement recorded"
            : "Class placement still required"}</li>}
          {row.activeEnrollment && <li>{row.studentAccessStatus === "approved"
            ? "Separate student learning account approved with a current grant"
            : row.studentAccessStatus === "access_unavailable"
              ? "Student account was previously approved but the live login grant needs review"
            : row.studentAccessStatus === "pending_review"
              ? "Student access consent awaiting independent registrar review"
              : "Guardian student access authorization still required"}</li>}
        </ol>
        {row.applicationId && <div className="mt-3 rounded-lg border bg-background p-3 text-sm">
          <p className="font-semibold">Next school handoff</p>
          {!row.activeEnrollment
            ? <p className="mt-1">{row.latestOfferStatus === "accepted"
                ? "The family accepted its offer. Admissions must activate school-year enrollment and assign a staffed instructional class."
                : row.latestOfferStatus === "issued"
                  ? "The school has issued an offer and is awaiting the verified guardian's response."
                  : "Continue the admissions review, eligibility requirements and offer decision. An inquiry is not an enrollment."}</p>
            : !row.placedInClass
              ? <p className="mt-1">Enrollment is active. Complete a staffed instructional class assignment before student learning access or onsite attendance.</p>
              : row.studentAccessStatus === "access_unavailable"
                ? <p className="mt-1">Class placement is active, but previously approved student access is now revoked or unavailable. Admissions must review the student's real access grant.</p>
                : row.studentAccessStatus !== "approved"
                  ? <p className="mt-1">Class placement is active. The guardian and registrar must complete separate student account consent and identity approval.</p>
                : <p className="mt-1">Learning access is approved. Confirm the child is expected on the scheduled onsite roster and record actual presence with authorized site staff; placement is not attendance.</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to="/admissions" search={{siteId:row.siteId,programId:row.programId,application:row.applicationId}}
              className="font-semibold underline">{!row.activeEnrollment ? row.latestOfferStatus === "accepted" ? "Activate accepted offer" : "Continue admissions" : !row.placedInClass ? "Assign instructional class" : row.studentAccessStatus !== "approved" ? "Review student access" : "Review enrollment"} →</Link>
            <Link to="/admissions/families" search={{siteId:row.siteId,programId:row.programId,application:row.applicationId}}
              className="font-semibold underline">Household checklist →</Link>
            {row.activeEnrollment && row.placedInClass &&
              <Link to="/staff/attendance" search={{programId:row.programId}} className="font-semibold underline">Scheduled school-day roster →</Link>}
          </div>
        </div>}
        {row.familyStartRequestId && !row.emailVerifiedAt && !row.applicationId &&
          <p className="mt-2 text-xs text-muted-foreground">Awaiting family email verification or application. A sent invitation is not an accepted application.</p>}
        {!row.admissionsAuthorized && !row.applicationId && row.status !== "closed" &&
          <p className="mt-2 text-xs text-muted-foreground">The family's interest is saved. Application invitations become available after CAN authorizes this school.</p>}
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
      </article>)}
      {items.length === 0 && <p className="text-sm text-muted-foreground">
        {nextCursor ? "No matching inquiries on this page. Load older records to continue."
          : "No family interest requests in your authorized programs yet."}
      </p>}
    </div>
    {loadError&&<p role="alert" className="mt-3 text-sm">{loadError}</p>}
    {nextCursor&&<button type="button" disabled={loadingMore||busyId!==null}
      onClick={()=>void loadMore()} className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
      {loadingMore?"Loading older inquiries…":"Load older inquiries"}
    </button>}
  </section>;
}
