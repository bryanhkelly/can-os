import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import type { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";

export type PublicInterestRecord = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>["items"][number];

/** Authorized, read-only family relationship details and action links.
 * The owning inbox retains mutation and refresh control, and server
 * endpoints verify each registrar action independently.
 */
export function PublicInterestRecordCard({
  row, busy, onInvite, onStatusChange,
}: {
  row: PublicInterestRecord;
  busy: boolean;
  onInvite: (row: PublicInterestRecord) => void | Promise<void>;
  onStatusChange: (row: PublicInterestRecord, status: "contacted" | "closed") => void | Promise<void>;
}) {
  return <article className=" border p-4">
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
              className={buttonVariants({ variant: "outline", size: "sm" })}>
              View linked inquiry
            </Link> : row.status !== "closed" && row.admissionsAuthorized && <Link to="/admissions/intake/new"
              search={{siteId:row.siteId,programId:row.programId,
                interest:row.id}}
              className={buttonVariants({ variant: "outline", size: "sm" })}>
              Review and create inquiry
            </Link>}
            {!row.applicationId && ["new","contacted"].includes(row.status) &&
              row.canSendApplicationInvitation &&
              <Button type="button" size="sm" disabled={busy}
                onClick={() => void onInvite(row)}
                >
                {row.familyStartRequestId ? "Resend expired application link" : "Invite to apply"}
              </Button>}
            {row.status === "new" && <Button type="button" size="sm" disabled={busy}
              onClick={() => void onStatusChange(row, "contacted")}
              variant="outline">
              Mark contacted
            </Button>}
            {["new", "contacted"].includes(row.status) && <Button type="button" size="sm" disabled={busy}
              onClick={() => void onStatusChange(row, "closed")}
              variant="outline">
              Close
            </Button>}
          </div>
        </div>
        <div className="mt-3  border bg-muted/30 p-3 text-sm" role="status">
          <p className="font-semibold">Next family step · {row.nextStep.owner}</p>
          <p className="mt-1">{row.nextStep.message}</p>
        </div>
        <ol className="mt-3 space-y-1 border-l pl-4 text-xs text-muted-foreground" aria-label="Family relationship history">
          {row.invitationBatchId && <li>Pre-opening invitation recorded · Provider receipt does not prove delivery or consent.</li>}
          <li>Family inquiry received · {new Date(row.createdAt).toLocaleString()}</li>
          <li>{row.consentAt
            ? `Follow-up requested by family · ${new Date(row.consentAt).toLocaleString()}`
            : "No affirmative follow-up consent recorded"}</li>
          {row.contactedAt && <li>Registrar follow-up recorded · {new Date(row.contactedAt).toLocaleString()}</li>}
          <li>{row.admissionsAuthorizationStatus === "temporarily_unavailable"
            ? "Admissions authorization could not be checked. Refresh before taking action."
            : row.admissionsAuthorized
              ? "CAN admissions and school-of-record services authorized"
              : "Application invitations blocked until CAN authorization"}</li>
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
        {row.applicationId && <div className="mt-3  border bg-background p-3 text-sm">
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
        {row.admissionsAuthorizationStatus === "not_authorized" && !row.applicationId && row.status !== "closed" &&
          <p className="mt-2 text-xs text-muted-foreground">The family's interest is saved. Application invitations become available after CAN authorizes this school.</p>}
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
      </article>;
}
