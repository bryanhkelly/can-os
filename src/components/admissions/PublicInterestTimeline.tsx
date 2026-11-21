import type { PublicInterestRecord } from "./PublicInterestRecordCard";

/** Chronological, source-owned evidence of a family's inquiry and school
 * admissions state. A timeline item is never a grant of enrollment authority.
 */
export function PublicInterestTimeline({ row }: { row: PublicInterestRecord }) {
  return <ol className="mt-3 space-y-1 border-l pl-4 text-xs text-muted-foreground" aria-label="Interest and follow-up history">
          {row.invitationBatchId && <li>Pre-opening invitation recorded · Provider receipt does not prove delivery or consent.</li>}
          <li>{row.programId===null?"Site interest received":"Family inquiry received"} · {new Date(row.createdAt).toLocaleString()}</li>
          <li>{row.consentAt
            ? `Follow-up requested by family · ${new Date(row.consentAt).toLocaleString()}`
            : "No affirmative follow-up consent recorded"}</li>
          {row.contactedAt && <li>Registrar follow-up recorded · {new Date(row.contactedAt).toLocaleString()}</li>}
          <li>{row.admissionsAuthorizationStatus === "temporarily_unavailable"
            ? "Admissions authorization could not be checked. Refresh before taking action."
            : row.admissionsAuthorized
              ? "CAN admissions and school-of-record services authorized"
              : row.programId===null
                ? "Site-level prospect. Choose an authorized Program before any application invitation."
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
        </ol>;
}
