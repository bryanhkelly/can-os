# Instructional tracks: server implementation status

Status: draft implementation, not a student-facing or production release.

The database foundation is migration `0081_instructional_tracks_and_practice`.
It follows the Site Blueprint foundation (`0079`) and reference library (`0080`).
Blueprint planning records do not grant academic authority or substitute for an active Program and Section enrollment.
Migration `0082` adds Program policy history, reviewed resource snapshots and command receipts.
The server entry points are in `src/modules/learning/instructional-tracks.functions.ts`.
No production migration, role provisioning, configuration change or deployment has been performed.

## Implemented server workflows

- Provider content catalog; create a draft; save incomplete drafts; submit a complete manifest.
- Independent academic, rights, accessibility and safety decisions; publish the unchanged reviewed manifest.
- Routine retirement and urgent rights/safety withdrawal. Emergency withdrawal remains available when authoring is disabled.
- List eligible tracks for an active Section enrollment; select or switch presenters using an expected selection revision.
- Resolve the selected lesson's recordings and recommended practice; record formative progress and read retained history.
- Transactional audit/outbox and request-key replay protection for mutations. Reusing a key with different input is rejected.

Command receipts commit with the mutation and its audit/outbox records. Retrying a recorded request still returns its original result after audit archival.
Each new presenter choice links to an immutable copy of the Program policy used for that choice.
Selections that predate migration 0082 have no recorded policy version.

These commands never write Sections, enrollments, assessments, submissions, lesson completion, credits or transcripts.
An idempotent retry returns the previously committed safe result after rechecking the caller's current authority.
It does not replay the mutation or reissue old media.

## Explicit content authority

`academic_content_creator` has only `instructional_track.author`.
`academic_content_reviewer` has `instructional_track.review`, `instructional_track.publish` and `instructional_track.withdraw`.
Neither role receives gradebook, roster, attendance or student messaging capabilities.

An account role alone is insufficient. Each provider content operation rechecks:

1. The original active account/person grant, verified email and active Person/account.
2. An organization-wide grant and membership in the Program's actual academic provider.
3. An active, provider-owned `role_assignments` row with the matching content role and explicit capability.
4. That assignment's `metadata.courseTemplateVersionIds` includes the exact published source release.
5. Any explicit Program restriction on the assignment, plus current shared-provider operating authority.

This is a separate institutional content delegation, not a Section teacher appointment or inferred credential.
No host-local invitation flow provisions these roles. No new public demo personas are introduced.
Presenter content eligibility is rechecked on student delivery, so a revoked delegation cannot be hidden behind a published profile.

V1 authoring permits provider-owned source courses only. A school adoption is not a third-party derivative-production license.
Church, nonprofit, cultural, religious and independent-school hosts follow the same Program-Site operating agreement workflow.
The CAN steward reviews shared-provider agreements using the existing institutional authority. Onsite opening retains its independent approval.

## Deployment and Program gates

Each feature requires both its environment flag (literal `true`) and the Program configuration below.
Missing, incomplete or invalid configuration denies the new feature.

| Environment flag | Program field |
|---|---|
| `CAN_INSTRUCTIONAL_TRACK_AUTHORING_ENABLED` | `authoringEnabled` |
| `CAN_INSTRUCTIONAL_TRACK_CHOICE_ENABLED` | `studentChoiceEnabled` |
| `CAN_INSTRUCTIONAL_TRACK_PRACTICE_ENABLED` | `practiceEnabled` |
| `CAN_INSTRUCTIONAL_TRACK_DELIVERY_ENABLED` | `deliveryEnabled` |

Example of an explicitly approved Program configuration, not an instruction to enable production:

```json
{
  "instructionalTracks": {
    "authoringEnabled": true,
    "studentChoiceEnabled": true,
    "practiceEnabled": true,
    "deliveryEnabled": true,
    "selectionPolicy": "student",
    "allowSwitching": true
  }
}
```

The object lives at `programs.metadata.instructionalTracks`.
`selectionPolicy` is explicitly `student` or `guardian`. A guardian needs both verified academic access and verified
enrollment-management authority for the particular child; guardians cannot submit practice as the student.
Selections are active only for an authorized active Section enrollment, with matching active Program/year membership.
All changes and practice writes serialize on that enrollment. Stale selection revisions are rejected.

## Content and privacy

The complete manifest covers source curriculum, media bindings, resources/documents, practice, private solutions and rights evidence.
Submission pins the reviewed catalog resource values to the release. Editing a catalog title or URL leaves students on their reviewed resource.
Delivery still verifies live ownership, licensing, audience and document bindings, and checks the approved manifest against current source and evidence.
An external URL identifies the approved reference. CAN does not control bytes served by the external publisher.
All canonical lessons require a primary recording and a caption or transcript resource before submission/publication.

Public placements require provider ownership and `curriculum_resources.metadata.audience = "student"`.
Rights evidence cannot be placed in learner content. Private media/resources require independent document verification,
approved MIME types and a central `learning/instructional-tracks/{provider}/{...}/{...}` storage path.
Section video uploads do not qualify as reusable master media.

Recording rights use a resource pointing to an independently verified document with:

- `subjectType = course_template_version`, `subjectId =` the pinned source release.
- `category = instructional_track_rights`.
- Metadata identifying `producerOrganizationId` and `presenterPersonId`.
- A future expiry that bounds the track's declared rights expiry.

These are verification requirements, not permission for developers to fabricate real approvals.
Central upload/finalization and rights-document management UI remain pending.

Private answers stay in `instructional_track_activity_secrets`.
Learner DTOs explicitly select safe fields; private answers, scoring explanations, rights evidence and storage keys are excluded.
V1 records no raw student answers or formative scores. `feedbackRelease` is retained for future governed feedback;
no solution/answer-release API has been implemented.

Practice history contains progress metadata, not the old exercise body or its media URLs. It survives presenter changes and
urgent withdrawal without making withdrawn content accessible again. History reads require current learner/guardian authority,
but do not require a current content license merely to return non-sensitive historical progress evidence.

Private media URLs expire after five minutes. Withdrawal blocks new API access/URL issuance; already issued URLs can remain
usable until expiry. A revocation-aware media proxy or equivalent control is still required if policy demands immediate
revocation of previously issued playback URLs. External provider URLs cannot be revoked at their source by CAN.

## Validation and remaining release work

Run:

```sh
npm run typecheck:instructional-tracks
npm run test:instructional-tracks
```

The integration suite builds the pre-Blueprint schema in isolated PGlite PostgreSQL, applies migrations 0079 through 0082 in order,
and reapplies the reference seed to verify its counts and confirm it creates no operational Programs or Activities.
It exercises the actual server commands and actual student class-authorization service; only the database binding and
unused request accessor are replaced. Test grants, recordings and rights evidence are synthetic test infrastructure.
It is not evidence of Neon migration-chain, signed-in browser or real-content acceptance.

Remaining before a P0 release: creator/reviewer and student UI, classroom wiring, central upload/finalization, reviewed media fixtures,
pending-request previews, request-abuse controls, live-Neon concurrency and migration tests,
authenticated multi-role browser journeys, Valor/Barton evidence, and rollout/rollback validation.
P1 assessment blueprints and shared-provider school-staffing/setup corrections remain separate work.
