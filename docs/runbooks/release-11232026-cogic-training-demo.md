# Release 11232026: COGIC executive pilot launch path

Status: source changes on `release-11232026`. No production migration, partner authorization, Course publication, registration opening, or live browser acceptance is asserted.

## What is implemented

1. `/site/new` now records the responsible Organization's declared category through the existing verified-email challenge and persists it with its own Organization, Site and initial Site-admin grant. `can_network` is not a public choice. A self-described denomination or consortium is initially registered as `other_partner` with pending classification evidence; independent HQ network verification remains separate.
2. `Shape → Programs & Audiences → Prepare → Program Catalog` continues using one published Blueprint recipe and one Site-scoped Solution plan. Catalog now explains whether an associated **learning Offering** is actually published, independently of the published Solution recipe.
3. The Prepare noncredit handoff passes `publicSiteId`. When the exact Offering is known, the Open-stage handoff also passes `offeringCode`, and is shown only to an authorized provider viewer with eligible registration candidates. This does not grant publication rights to a Site administrator.
4. The read-only `scripts/sql/canonical-v301/cogic-pilot-publication-readiness.sql` exposes the two draft pilot statuses and lesson/content-review blockers.

## Verified Neon main facts on November 23, 2026

| Offering | Offering / Course / Training / Assessment | Lessons | Missing/review |
| --- | --- | ---: | --- |
| `CLC-CUSTOM-TRAINING-01` | all draft; no training approver | 7 | all 7 placeholder media, partner content review and unpublished assessment |
| `CLC-DIGITAL-01` | all draft; no training approver | 4 | four lessons with supplemental YouTube references flagged for instructor review, all four assessment status pending |

These records are owned by the existing synthetic CAN Community Learning Center (Demo) publisher. Their recipes may be browsed in a Site plan, but the content **must not be called live or enrollable**.

## Approved publication process, not an automatic migration

1. Obtain real publisher identity and content rights. Confirm Issachar organizational speaker recordings, each module's instructional media, its license/consent, and authorship of assessment/feedback material. AI & Digital Skills links must be independently reviewed for permitted instructional use and accessibility, and original/course-owned material supplied where necessary.
2. Publish course lessons, assessment forms, survey instruments and the Course using their existing governed services and review evidence. Do not directly update `lifecycle`, `published_at`, `approved_by_person_id` or the publisher Organization through seed SQL.
3. Independently approve and publish the Offering and noncredit training version. Create an effective governed completion policy. Approve Site/operation adoption, actual provider delegation and registration authorization before issuing any release.
4. Run read-only SQL again. Authenticate as provider to confirm the Offering is available for the exact authorized Site. Publish an enrollment release from the actual provider role, not from the new Site Admin. Test adult self-enrollment, lesson progress, assessment, survey and governed completion with isolated test identities.
5. Test national aggregation only after approved cross-Organization network delegation; same-operator Site totals are not denomination-wide impact figures.

## Database and deployment

- New additive migration: `drizzle/0103_site_signup_organization_classification.sql`.
- It must be applied on an isolated test branch first, then reviewed before any production deployment.
- The existing public Site signup remains a verified-email flow and never provisions a national HQ administrator or live program simply because the user selected a denomination.
- Do not deploy the TypeScript changes against a database missing the new `school_setup_signups.organization_type` column.
- Run `npm run typecheck`, `npm run build`, focused Vitest, migration rollback/retry checks, and authenticated Playwright. Verify the deployed SHA and database branch.

## Suggested demo order

Create an ordinary training Site under an authorized rehearsal Organization → select adult learning and the two Program intents → choose the published planning recipes → save and resume a Site-specific Solution plan → show the honest course-publication requirements → switch to an **independently prepared, authorized** Course enrollment and reporting example. Keep simulated evidence labeled. Do not claim the COGIC partnership itself is approved.
