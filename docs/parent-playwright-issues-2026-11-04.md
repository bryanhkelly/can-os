# Parent Playwright Exploration Issues

Date: 2026-11-04
Environment: local app at `http://127.0.0.1:5183`
Role: approved synthetic Guardian workspace
Method: Playwright browser exploration through the app UI; no product APIs called directly.

## Confirmed Issues

### PP-01: Enrollment checklist buttons do not open the checklist

**Impact: High.** A parent cannot inspect the required forms and school instructions from the offer/application workspace.

Steps: Open `/guardian/admission-offers?student=f1000000-0000-4000-8000-000000000005` for synthetic Jordan Example. Click **View enrollment checklist**, then **Review enrollment checklist →**.

Observed: Both clicks leave the page unchanged. The first button remains `aria-expanded="false"`; the expected `Family enrollment checklist` section is not rendered. The application card reports two required items needing review. Rechecked after a page reload; regular route navigation and other parent actions worked.

### PP-02: Permission notifications lead to empty or already-resolved queues

**Impact: Medium.** Unread alerts tell the parent to review decisions that are not available on the destination page.

Steps: Open `/notifications` and follow **Open related record** for a **Study group permission requested** notice. Also open the course-approval and field-trip notices.

Observed: Both study-group notices lead to `/guardian/group-permissions`, which says no requests are waiting. The course-approval notice leads to a page with no pending course requests. The field-trip notice leads to an invitation already marked **Permission declined**. Notifications remain unread and continue to say a review is needed.

### PP-03: Calendar month view does not identify cancelled events

**Impact: Medium.** A parent can mistake cancelled conferences for upcoming events.

Steps: Open `/calendar` in November 2026 and inspect Nov 5, then select Nov 5.

Observed: The month grid shows two `SIMULATED PW Family Conferences 20261102` entries without status. The selected-day panel identifies both entries as **Cancelled** (4:20–4:40 PM and 4:40–5:00 PM, America/Los_Angeles).

### PP-04: Conference reminder is unlinked, raw UTC, and conflicts with cancellation state

**Impact: Medium.** The parent cannot navigate from the reminder to manage the appointment and may believe a cancelled conference is still scheduled.

Steps: Open `/notifications` and inspect **Parent-teacher conference reminder**.

Observed: The notice says `Your conference is scheduled for 2026-11-06T00:40:00.000Z` and has no related-record link. This is Nov 5 at 4:40 PM in the displayed Pacific timezone; the calendar lists the corresponding conference event as cancelled. The School & Community conference list offers bookable office-hour slots, but the reminder itself does not explain the cancellation or provide a management route.

## Intermittent Runtime Failure

### PP-05: Workspace shell reported a hook-order error during offer navigation

**Impact: High if reproducible. Status: intermittent; not reproduced after reload.**

Steps: While switching from guardian academics to the filtered enrollment-offer route, observe the browser console and route boundary.

Observed: React reported a change in hook order in `WorkspaceTopBar`, followed by `TypeError: Cannot read properties of undefined (reading 'next')` and a root-route error boundary. A clean reload recovered and subsequent navigation worked. This occurred while many unrelated source files were being edited in the shared worktree, so no root cause is attributed.

## Responsiveness Observation

Attendance, health and Messages initially remained in loading states for roughly 18, 20 and 25 seconds respectively before data appeared. No failed API responses were observed in the health recheck. This is a confirmed observation in this local demo environment, not yet isolated to frontend or database latency.

## Other Observations

- Parent sign-in, family home, child selection, academic progress, report cards, enrollment offers, application workspace, family-change request form, health record view, school experiences, field trips, study-group permissions, calendar, profile and account sessions were reachable.
- The report-card view intentionally surfaces synthetic transcript data with conflicting course/term records and four credit entries requiring review. This is recorded as demo-data quality, not a confirmed product defect.
- No medical update, SMS enrollment, custody/pickup change, withdrawal/transfer request, new application, offer decision, conference booking or field-trip response was submitted.

## Scope and Data Safety

The exploration used the approved shared Valor synthetic Guardian account. Two clearly labeled synthetic actions were submitted: an excuse for the seeded Oct 15 absence and a reply in the existing synthetic assignment conversation. The excuse remained pending school review. External email and SMS were suppressed. No authentic student or family records were entered.