# CAN OS functional completeness audit — 2026-10-16

Scope: selected canonical implementation, routes, documented golden flows, and available CI coverage on main. This is a **code and documentation audit**, not a completed browser or live Neon test. No real student data.

## Standard

A feature is **Complete** only after an operator can execute its full happy path and at least one denial/error path against isolated synthetic Neon data, refresh the browser, switch personas, confirm all affected views are consistent, and inspect audit/events. Compilation, existence of UI, and a successfully merged PR alone are insufficient.

States: Complete / Partially Complete / Foundation Only / Missing. No feature below is marked Complete without actual end-to-end execution evidence.

| Golden flow | Assessment | Verified code capabilities | Unproven or missing acceptance evidence |
| --- | --- | --- | --- |
| GF1 Academic intervention | Partially Complete | Assignments/submissions, synthetic notifications, support referral | Teacher → student → guardian → specialist propagation; missing-work and late-submit end-to-end audit |
| GF2 Admissions → enrollment | Partially Complete | Household readiness writes, offer transactions, guardian responses, activation, admissions and family status views | Multi-person browser scenario; verification that section/course access, household and student workspaces update; event delivery |
| GF3 Host/program launch | Foundation Only | Program and site services / launch journey model | Complete church host and K–8 extension launch flows across roles |
| GF4 Attendance and excuse | Partially Complete | Attendance and family functions documented in golden flow | Full guardian-review lifecycle, metrics and offline duplicate rejection |
| GF22 Admissions pipeline | Partially Complete | Application records, requirements, capacity, offer and activation controls | Inquiry-to-application creation/qualification, waitlist, rejection/withdrawal, days-in-stage queue and tests |
| GF23 School-year setup | Foundation Only | Academic year, terms, calendars and schedule schema | Editable cross-site calendar setup with validation and synchronized downstream updates |
| GF26 Study groups | Partially Complete | Neon-backed groups/memberships/posts/reports/sessions; calendar event on session creation | Calendar cancel/update, group-specific guardian consent, moderation SLA, identity-scoped cross-role browser tests |
| GF40 Course registration | Partially Complete | Synthetic add/drop/withdraw service and persisted request | Cross-role approval UX, verified prerequisites, credit limits, conflicts, official transcript consequence |

## Priority execution backlog

P0: Fix tests to exercise full GF2 with one synthetic household and two children across registrar, guardian, and student roles; verify issue → accept → activate is idempotent and rejects a competing capacity claim. Run on a disposable Neon branch only.

P0: Create a repeatable synthetic fixture manifest for every currently surfaced route (record counts, expected persona, expected interactions, expected downstream records). Report unseeded routes as coverage failures rather than showing misleading empty screens.

P1: Link GF2 activation to authorized student Today, guardian household, course proposal and notifications; require canonical read-after-write consistency.

P1: Close GF1 teacher missing work → notification → guardian → referral → grade → resolve workflow.

P1: Finish GF26 session reschedule/cancel propagation, RSVP and moderation review lifecycle.

P1: Move GF22 inquiry, decision and waitlist stages from read-only summaries to complete workflow actions with transitions and negative tests.

P2: Program launch templates, calendar subscriptions, enrollment exports, configurable summer/after-school schedules.

## Development release vs real-school release

For the current first development build, synthetic reads and writes must remain **fully interactive** on a synthetic-only database. Real authentication is not a prerequisite for *development* completeness, but client persona selection is not a secure authorization primitive and must never be treated as real-school readiness. Keep demo environments and their synthetic fixtures isolated from any future real student data.

## CI and deployment evidence

Existing CI runs a production build/typecheck, migration generation drift check, and unit tests. That **does not** constitute completion of browser role-switch or isolated Neon concurrency tests. Netlify deployment status and live database migrations must be independently verified for every release. Do not mark those gates passed when only the GitHub checks succeeded.
