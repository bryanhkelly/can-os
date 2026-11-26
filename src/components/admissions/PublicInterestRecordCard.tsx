import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { WorkspacePanel, WorkspaceNotice, ActionFooter, StatusBadge, FormSection } from "@/components/workspace";
import { PublicInterestTimeline } from "./PublicInterestTimeline";
import type { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";

export type PublicInterestRecord = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>["items"][number];

/** Authorized, read-only family relationship details and action links.
 * The owning inbox retains mutation and refresh control, and server
 * endpoints verify each registrar action independently.
 */
export function PublicInterestRecordCard({
  row, busy, onInvite, onStatusChange, programChoices, selectedProgramId,
  onSelectProgram, onAssign,
}: {
  row:PublicInterestRecord;busy:boolean;
  onInvite:(row:PublicInterestRecord)=>void|Promise<void>;
  onStatusChange:(row:PublicInterestRecord,status:"contacted"|"closed")=>void|Promise<void>;
  programChoices?:readonly {id:string;name:string;siteId:string|null}[];
  selectedProgramId?:string;
  onSelectProgram?:(programId:string)=>void;
  onAssign?:(row:PublicInterestRecord)=>void|Promise<void>;
}) {
  return <WorkspacePanel title={`${row.firstName} ${row.lastName}`} description={row.programName??"General Site interest"} actions={<StatusBadge>{row.status}</StatusBadge>}>
        <div className="space-y-3">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="mt-1 text-sm">{row.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()} · {row.status} · {row.source === "staff_invitation" ? "Pre-opening invitation response" :
                row.source === "published_site_general" ? "Prelaunch Site interest" : "Public website inquiry"}
            </p>
          </div>
          <ActionFooter layout="inline">
            {row.applicationId && row.programId ? <Button asChild variant="outline" size="sm"><Link to="/admissions/intake"
              search={{siteId:row.siteId,programId:row.programId,
                application:row.applicationId,interest:undefined}}
              >
              View linked inquiry
            </Link></Button> : row.programId && row.status !== "closed" && row.admissionsAuthorized && <Button asChild variant="outline" size="sm"><Link to="/admissions/intake/new"
              search={{siteId:row.siteId,programId:row.programId,
                interest:row.id}}
              >
              Review and create inquiry
            </Link></Button>}
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
          </ActionFooter>
        </div>
        <WorkspaceNotice className="mt-3">
          <p className="font-semibold">Next step · {row.nextStep.owner}</p>
          <p className="mt-1">{row.nextStep.message}</p>
        </WorkspaceNotice>
        {row.programId===null&&!row.applicationId&&
          ["new","contacted"].includes(row.status)&&row.consentAt&&
          <FormSection className="mt-4" columns={1} title="Move this Site interest to an authorized Program" description="Only a registrar may select the appropriate Program. The server rechecks current admissions authorization. Linking the existing prospect does not create an Application or reserve a place.">
            {programChoices?.length&&onAssign&&onSelectProgram
              ? <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Program to invite about (authorization verified on save)">
                    <Select value={selectedProgramId??""}
                      disabled={busy} onChange={event=>onSelectProgram(event.target.value)}>
                      <option value="">Choose a Program</option>
                      {programChoices.map(program=><option key={program.id}
                        value={program.id}>{program.name}</option>)}
                    </Select>
                  </Field>
                  <Button type="button" variant="outline"
                    disabled={busy||!selectedProgramId} onClick={()=>void onAssign(row)}>
                    Link to Program
                  </Button>
                </div>
              : <p className="mt-2 text-xs text-muted-foreground">
                  No authorized Program is available for selection in your current scope.
                </p>}
          </FormSection>}
        <PublicInterestTimeline row={row} />
        {row.applicationId && row.programId && <WorkspacePanel title="Next school handoff" className="mt-4">
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
        </WorkspacePanel>}
        {row.familyStartRequestId && !row.emailVerifiedAt && !row.applicationId &&
          <p className="mt-2 text-xs text-muted-foreground">Awaiting family email verification or application. A sent invitation is not an accepted application.</p>}
        {row.programId && row.admissionsAuthorizationStatus === "not_authorized" && !row.applicationId && row.status !== "closed" &&
          <p className="mt-2 text-xs text-muted-foreground">The family's interest is saved. Application invitations become available after CAN authorizes this school.</p>}
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
      </WorkspacePanel>;
}
