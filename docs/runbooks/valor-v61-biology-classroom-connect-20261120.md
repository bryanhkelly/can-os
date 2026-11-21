# Valor School | Biology Classroom Connect V6.1 enablement

**Branch:** `feature/platform-admin-catalog-blueprints-20261120`
**Canonical tenant:** Valor School, Organization `f1000000-0000-4000-8000-000000000002`, Site `f1000000-0000-4000-8000-000000000003`
**Exact Class:** `26c4fa42-7f05-a9f0-eb63-6624dc7463d3`, Biology · CAN Standard
**Riley Person:** `f1000000-0000-4000-8000-000000000006`; **Jordan Person:** `f1000000-0000-4000-8000-000000000005`

## Observed and applied, November 20, 2026 (Pacific time)

- The guarded, idempotent fixture `scripts/recovery/valor-v61-biology-hybrid-delivery-20261120.sql` **was applied to Neon main and read back**: only Biology · CAN Standard is `hybrid`; the other 11 Valor Classes remain `self_paced`. The class is active, has 11 active enrollments and 184 lessons; Jordan retains nine active Classes and Riley has his original approved teacher assignment. Zero Class Sessions exist.
- The branch has source changes for the exact additional Riley grant, an operator-gated audited provisioner, a one-login restricted CAN staff SQL function patch, explicit facilitator-only Class assignments, and CAN-grant/session revalidation for room hosting. **Source commits are not proof of a deployed or verified production journey**.
- The retired Riley-only authorization function was replaced by `database/production/2026-11-20-can-staff-auth-parity-and-demo-delegation.sql` in an atomic Neon main transaction. Its verified projection applies the same CAN Session, Person, grant, Organization and Site rules to synthetic and real staff, with one separate Demo Admin switch authorization. No Riley-specific runtime exception is present.
- Read-only Neon query `scripts/acceptance/verify-valor-v61-biology-classroom-connect-20261120.sql` returned **10 pass, 4 pending**: Riley's separately approved Class facilitator assignment, one future 35-minute Session, its published agenda, and an authorized published video.
- On November 20 (Pacific time), `scripts/recovery/valor-v61-riley-facilitator-operator-provision-20261120.sql` was applied to Neon main in a single guarded transaction. The exact synthetic Valor Organization lifecycle was reconciled from NULL to `active` to meet the existing restricted staff session reader. Riley now holds two active CAN grants under one verified account and immutable Person: teacher plus `room_facilitator`. The facilitator institutional role contains only `learning.room.facilitate`. A provisioning audit and domain event were recorded, together with a distinct audit for the real synthetic Organization lifecycle reconciliation. The script was rerun successfully without creating additional audit or event rows.
- `src/domain/access-context.ts` was hardened on the feature branch to restrict Riley's fixture grant to `learning.room.facilitate` instead of inheriting default onsite/attendance/pickup capabilities. It must be deployed and verified before treating the grant as fully scoped in the live app.
- Sally's email is unverified and the prior suspended staff assignment evidence remains. Do not change either to make testing pass.

## Remaining operator-mediated handoff

1. **Validate the exact source and permissions.** Review the diff and run `npm run typecheck`, `npm run test:classroom:unit`, `npm run test:classes:unit`, `npm run check:class-architecture`, `npm run check:route-identifiers`, `npm run lint`, `npm run build`, and `npx vitest run tests/unit/valor-classroom-connect-v61.contract.test.ts tests/unit/native-class-room-boundary.test.ts tests/unit/demo-session-isolation.test.ts tests/unit/local-demo-access.test.ts` on a checkout of this feature branch. Use a disposable **schema-aligned** QA Neon branch, never Neon main, for mutating tests.
2. **Riley's second role is already provisioned.** The verified, transactional Neon main update is `scripts/recovery/valor-v61-riley-facilitator-operator-provision-20261120.sql`. It checks the existing verified account, one immutable synthetic Person, active teacher grant and exact Site/Organization, then creates only the fixed facilitator grant and narrow institutional role. It records the true database mutation, not a manager approval or CAN login. Do not run the generic provisioning commands to duplicate or replace this grant. The existing `npm run demo:provision-registrar -- --riley-facilitator-only --apply` path remains available for controlled fixture rehydration in explicitly enabled test/development environments.
3. **General restricted-reader SQL applied.** `database/production/2026-11-20-can-staff-auth-parity-and-demo-delegation.sql` is installed on Neon main. Direct staff accounts, synthetic or real, take the same validation path. Only the authenticated Demo Admin may switch to another eligible existing Site grant, and every protected Class action still requires its own current Class relationship. Recheck revocation and direct-versus-impersonated access before release.
4. **Approve the separate Class assignment using the actual manager workflow**, `assignNativeClassStaff({classId,personId,roleCode:"facilitator",canVerifyAttendance:false})`, invoked by a current authorized Site Admin/Registrar. The server must independently confirm the exact verified CAN facilitator grant and exact Site and Organization. Do not manually insert an `approved` staff record as a shortcut; the Class manager command generates audited, dated assignment evidence. The existing teacher assignment is retained.
5. **Confirm runtime prerequisites.** Both `CAN_CANONICAL_AUTH_DATABASE_URL` (a truly restricted database connection, not `DATABASE_URL`) and `CAN_CANONICAL_ACCESS_TOKEN_PEPPER` must be configured for native CAN staff authentication. `CAN_FACILITATED_PAIRING_PEPPER` is also required for Classroom Connect code issuance. These are runtime security prerequisites, not a new feature flag. Never put the secret values in the fixture or logs.

6. **Select Riley's current Room Facilitator role** via the normal account role switcher. The selected `access_sessions.active_grant_id` must match the active facilitator grant, while account, Person, organization, Site and role remain unchanged. With his teacher role selected, scheduling and protected room controls must be denied.
7. **Schedule exactly one future 35-minute native Class Session** from the existing `scheduleNativeClassSessions` server action with `cadence:"custom"`, one fresh `requestId`, and start/end times derived in the selected Site timezone and converted to explicit offset-aware timestamps. Pick a window still in the future when executed, then read back the canonical `class_sessions` / `delivery_sessions` / `facilitated_classroom_plans` link. The native Session contract currently does not persist an independent freeform session title; the proposed operator label is **Biology Classroom Connect Demonstration**. Do not insert directly into Session tables.
8. **Publish the Class Session study plan through the existing revision service** `publishNativeClassSessionAgenda` using the Class/Session IDs, a new idempotency key, expected revision 0, and only published, currently eligible Biology lesson references. This is necessary before `openNativeClassSession`; scheduling alone does not open, approve or publish content.
9. **Authorize video rights separately.** At the November 20 read-back, Biology had **zero** published `track_lesson_presentations` linked to a published `content_asset_versions` record. Existing lesson resource URLs and supplemental review-pending YouTube candidates are not sufficient for the existing `validateRoomVideo` boundary. Use the canonical media/rights publication workflow, with truthful licensing, before asserting that shared video playback works. Never spoof a publisher approval or bypass `validateRoomVideo`.
10. **Test independently authenticated Riley and Jordan.** Riley opens the scheduled Session in its permitted window, generates/rotates a short-lived pairing code, uses the shared-screen projector (no private roster or answers), releases one multiple-choice and one short-response activity, sees permitted aggregated responses, and ends the room. Jordan opens his existing Biology Class using his own CAN session, pairs his existing Course Attempt at `/join` or the QR route, responds, and returns to self-paced lessons/homework. Check course-attempt ID and nine-Class counts before and after.
11. **Run negative access checks in isolated QA** for Riley teacher-only role, revoked facilitator grant, Sally unverified/suspended login, foreign-Site student, foreign Course Attempt, expired/rotated code, and private-projector controls; ensure none emits attendance, official grades, academic credit or credential awards. Run authenticated browser acceptance against the exact deployed commit before declaring completion.

## Architecture parity decision

Synthetic records are ordinary CAN OS records. No domain service, lesson playback,
Class, homework, Course Attempt, media rights, school opening or grant resolver
may branch on a synthetic marker, demo domain or a fixed Valor/Riley ID. Site and
role authorizations apply equally to actual and synthetic schools. Test fixtures
may pin stable IDs and use the standard provisioning workflow. Demo passwordless
login and authenticated Demo Admin cross-account switching are the **only**
exceptions, isolated to the authentication/session boundary. Audit must retain
both the effective Person and the verified administrator account when switched.

The protected canonical Class workflow still requires an approved current
facilitator Class staff assignment, an authorized published agenda, rights-cleared
media and an eligible future session. These are not fixture-specific exceptions.

## November 20 V6.1 real/synthetic parity cutover

**Implemented in the feature branch (not independently build-tested):**
- All ordinary CAN Site staff use one active CAN session projection. The prior
  Riley-only SQL function was removed and replaced in Neon main by
  `database/production/2026-11-20-can-staff-auth-parity-and-demo-delegation.sql`.
  The only special selection is authenticated Demo Admin switching; effective
  grant/Person/Site/Organization validation is the same after switching.
- `src/domain/access-context.ts` assigns classroom-only facilitation rights to
  **every** room_facilitator, not a specific Riley grant. Physical attendance,
  pickup release and safeguarding remain separate Site staff capabilities.
- The Sally institutional fixture was reconciled by
  `scripts/recovery/valor-v61-standard-facilitator-capability-reconcile-20261120.sql`.
  Her email remains unverified and her staff assignment stays suspended.
- `src/modules/classes/native-class-student-home.functions.ts` and
  `NativeStudentClassHome.tsx` replace the Valor-only Class home. They read
  ordinary Site Classes and Enrollment status, but do not create synthetic
  student registrations. Student enrollment/guardian consent is owned by
  normal governed enrollment services.
- `NativeClassLessonContentPanel` is content-driven, regardless of a Course's
  provenance marker. Prior synthetic-specific draft practice endpoints and
  UI were retired rather than exposing unpublished assessment forms to
  real students. Existing records were not dropped.
- Practice-only Class homework is now inferred from Enrollment credit mode,
  and assigned teachers can return formative feedback through the standard
  submission. The staff read still requires an approved Class teacher role.
- New regression contracts cover equivalent real/synthetic permissions and
  trusted Admin impersonation. They are **committed but not executed**.

**Remaining acceptance work:** A current Site manager must approve Riley's
separate Biology facilitator Class assignment through the normal service.
An eligible future Session, published agenda and authorized shared video
are still missing. Authenticated direct and impersonated Riley/Jordan browser
testing, TypeScript, architecture and build verification remain required.
Netlify deploy-preview failures observed on November 20 are explicitly
`Skipped due to account builds usage exceeded`, not build results.

## Code owners

- Role allowlist and selection: `src/domain/local-demo-access.ts`, `src/modules/identity/session-grants.server.ts`, existing CAN session switcher
- Audited synthetic bootstrap: `src/modules/_demo/provision-demo-registrar.ts`, `scripts/provision-demo-registrar.mjs`
- Restricted session reader: `src/modules/identity/restricted-canonical-session-reader.server.ts`, `src/modules/identity/can-site-staff-authority.server.ts`, scoped SQL patch above
- Class authorization: `native-class-session-host.server.ts`, `native-class-room-boundary.server.ts`, `native-class-facilitator-session.server.ts`, `class-staff.functions.ts` in `src/modules/classes/`
- Canonical sessions and study plan: `native-class-sessions.functions.ts`, `native-class-session-agenda.functions.ts`; the existing `/class/$classId` UI and `/join` route
- Live room commands and learner pairing: existing `src/modules/learning/facilitated-learning-operations.server.ts` and `facilitated-learning.functions.ts`

**Never claim complete** on the basis of this source or SQL alone. The source branch has not been built or typechecked in this run, the restricted CAN projection and additional Riley grant are installed in Neon main but the standard classroom-only capability change and delegated-audit code are not yet verified as deployed, no manager has approved the separate facilitator assignment, no Session has been scheduled or published, and live authenticated browser acceptance has not been executed.
