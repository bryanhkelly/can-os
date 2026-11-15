# My CAN universal account: first implemented slice

## Product contract

One CAN login is the person's persistent entry into schools, community programs, learning centers, and staff workspaces. A Site favorite is a personal bookmark, not an institutional relationship.

- **Account**: verified sign-in and account-wide security sessions.
- **Person**: canonical human identity. Different Person IDs under a non-demo login are flagged, never auto-merged.
- **Workspace**: a verified, scoped grant. School/student/guardian/staff access is still authorized by the existing membership switch service.
- **Favorite Site**: independent account-owned preference. Saving a Site does not issue a role, membership, enrollment, consent, or grant access to private records.
- **Location**: a physical or online service context, distinct from organization affiliation and delivery session.

## Implemented in main

- `/account/` My CAN hub using the V6.1 shared workspace shell, square-corner panels, DM Sans operational text, restrained serif headings, cool-neutral surfaces and primary actions.
- Account reader uses the existing server-verified session and grants, returns active/alternative workspaces and account holder summary.
- Workspace changes reuse `switchVerifiedMembership`; the browser cannot manufacture a role or Site assignment.
- Published Site directory (bounded), separately authorized private Site locations, favorite save/remove and approved public website links. Unpublished locations are never advertised publicly.
- `access_account_favorite_sites` is keyed by `(account_id,site_id)`, not Person or Site memberships.
- RLS policy uses transaction-local `can.account_id`; app server sets it only after validating the account session.
- Favorite commands are idempotent. One account may keep bookmarks while switching verified roles.
- Account menu, sidebar and Settings link to My CAN. Existing school/student/family home pages are retained.
- Migration `drizzle/0081_account_favorite_sites.sql` added to the Drizzle journal. Test01 migration applied; production database not changed in this pass.
- Pure unit tests added for actual Site publication and account Person-identity mismatch.
- Missing favorites migration leaves account/workspace summary accessible with explicit unavailable state.

## Remaining before full universal identity rollout

1. **Account-only onboarding**: users with no accepted membership must be able to create and sign into CAN without an institutional grant. Current passwordless flow requires membership or approved invitation.
2. **Verified profile portability**: schools/programs may request only necessary fields with recorded, versioned disclosure/consent; do not sync private school records by default.
3. **Registration integration**: adult self-registration, group sessions, minors and parent-managed school admissions should all reuse one verified account while preserving their separate eligibility and decision authorities.
4. **Account/person reconciliation**: operator-reviewed, auditable reconciliation when legacy grants reference distinct real Person IDs. Never merge automatically based on email.
5. **Discovery scale**: searchable, paginated public locations and offering/session matching instead of the first 100 published locations.
6. **Acceptance**: local typecheck, route inventory gate, unit/e2e coverage, dual-account RLS isolation under restricted principals, mobile/keyboard/200% zoom, actual deployment to production, then the approved production migration.

No change to official grades, records ownership, guardian authority, staff delegation, educational enrollments or CAN v3.0.1 course participation was made for this slice.
