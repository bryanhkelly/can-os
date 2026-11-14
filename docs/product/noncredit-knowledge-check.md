# Noncredit knowledge checks in the shared CAN OS classroom

**Scope:** Phase 1 private organizational learning; reusable for adult, summer, workforce and other authorized noncredit offerings. No new routes, navigation, grading, academic credits, transcript, or credential issuance.

## Pilot acceptance gates

The latest source changes address the previously identified launch blockers:

- **Evidence authority:** `v28_validate_completion()` now counts only independently verified, time-valid evidence and rejects assessment results that are not finalized for the same noncredit registration's Course attempt. The learner readiness calculation also excludes future-dated events.
- **Automatic assessment authorization:** a published provider-approved noncredit Course attempt provisions its own learner profile and Course-bound assessment grant. If the approved assessment administration opens later, a second trigger provisions eligible attempts. Existing revoked grants are never reopened.
- **Historical results:** a closed assessment administration no longer prevents personal result retrieval. Historical access never authorizes a new attempt or restarts an expired submission window.
- **Mobile recovery and retakes:** choices are saved as append-only answer revisions; reload uses the most recent draft per question. Attempt limits and accommodations remain governed by the canonical database. Do not enable production access until interrupted-save, multiple-device and retry boundary tests pass.
- **Surveys:** campaign-scoped, published, identified learner surveys use verified permission evidence and an existing personal invitation. A campaign must explicitly opt into the `knowledge_check_submitted` trigger to create an in-app invitation after a scored knowledge check. The feedback panel refreshes after submission; feedback is not a knowledge-check result.
- **Separation:** lesson milestones add only zero-minute self-report activity, while verified attendance minutes are independently assessed; none of this produces grades, credit, transcripts or licenses.

### SQL change ordering for an existing canonical v3.0.1 database

Do not run these migrations against production without a reviewed, isolated acceptance rehearsal. In a disposable branch, apply the applicable patches in this order:

1. `patch-canonical-learner-grant.sql`, if the native learner grant is not already installed
2. `patch-noncredit-auto-finalization.sql`, if the gated objective noncredit scoring rule is required
3. `patch-noncredit-lesson-milestones.sql`
4. `patch-noncredit-evidence-and-result-authority.sql`
5. `patch-auto-noncredit-assessment-access.sql`
6. `patch-noncredit-feedback-invitations.sql`
7. `patch-noncredit-locked-policy.sql` (immutable registration policy plus opt-in mode)
8. `patch-noncredit-automatic-completion.sql` (authorized automatic evaluator and event hooks)
9. `patch-noncredit-baseline-diagnostic.sql` (optional before-course diagnostic, alternate grants and scorer rule)

The canonical `schema.sql` incorporates the fresh-install variants. The lesson milestone patch was updated to retain the stricter evidence function even when patches are applied out of order. These patches are committed to GitHub but **not deployed** by this development work.

Run the read-only post-migration gate with an isolated database and:

```bash
APP_ENV=test TEST_DATABASE_URL="..." node scripts/acceptance/check-noncredit-pilot-readiness.mjs
npm run typecheck
npx vitest run tests/unit/noncredit-completion.test.ts tests/unit/noncredit-knowledge-check.test.ts tests/unit/noncredit-phase1-integrity.test.ts tests/unit/learning-questionnaire.test.tsx
```

Then run a transactionally rolled-back, **restricted-principal** acceptance scenario with two unrelated adult Persons and a provider operator: registration, automatic grant, recorded and presenter-independent lesson milestones, draft save and resume across devices, duplicate submit, retake-limit exhaustion, feedback invitation and submission, verified attendance evidence, completed noncredit decision, cross-learner denial, and historical result access after administration closure.

A GitHub Actions `startup_failure` is not a passing test. Do not claim integrated production readiness until the actual tests complete successfully on the isolated branch and application roles pass RLS isolation.

## Phase 1+ completion and impact reporting

- **Requirements are pinned:** `noncredit_registrations.completion_policy_id` selects the most recent approved, published, effective policy at registration. It cannot change later. Historic rows without a policy eligible at registration remain unpinned, are ineligible for completion, and need a reviewed enrollment remediation instead of silently inheriting a new policy.
- **Provider-controlled automation:** `noncredit_completion_policies.completion_mode` defaults to `provider_review`. Independently authorized provider staff can publish an immutable new policy with `publishNoncreditCompletionPolicy`; existing registrants retain their version. Automatic completion is available only for policies explicitly marked `automatic`.
- **Decision provenance:** automatic decisions use `decision_source='automatic'`, with the policy reviewer retained as the authorizing person, and separate system-attributed audit and domain events. The evaluator locks the registration, never overwrites a recorded decision and never writes school grades or credits.
- **Evidence gates:** event hooks re-evaluate on Course activation, lesson completion, recorded attendance, assessment finalization and later evidence verification. The completion SQL independently validates verified minutes, lesson milestones, and the current finalized course-bound result. Zero required minutes is valid for asynchronous training when learning requirements provide the evidence.
- **Before/after measurement:** an optional `baseline_assessment_version_id` on published training uses the same objective assessment engine and a `diagnostic` purpose. Only a baseline taken before documented instruction and before the final check is eligible for paired improvement reporting. The final assessment remains the only one that may satisfy a completion knowledge requirement.
- **Reusable reporting:** `getNoncreditPilotOutcomes` returns provider-scoped registrations, engagement, knowledge checks, responses and confirmed completion decisions. `publicationSafePilotSummary` suppresses small cells in partner-facing reports. A learner's progress click is not automatically a verified minute or a completion.
- **Provider UI:** the existing canonical noncredit lab now embeds `NoncreditCompletionPolicyPanel` and `NoncreditPilotOutcomesPanel`, without creating new navigation paths.
- **Scale guard:** the initial interactive report has an explicit 5,000-participant ceiling per query; larger network reports require batched/warehouse-style aggregation rather than silently truncated results.

### Acceptance before pilot activation

```bash
npm run typecheck
npx vitest run tests/unit/noncredit-completion.test.ts tests/unit/noncredit-completion-automation.test.ts tests/unit/noncredit-pilot-outcomes.test.ts tests/unit/noncredit-phase1-integrity.test.ts
APP_ENV=test TEST_DATABASE_URL="..." node scripts/acceptance/check-noncredit-pilot-readiness.mjs
APP_ENV=test TEST_DATABASE_URL="..." node scripts/acceptance/check-noncredit-pilot-isolation.mjs
```

The two-learner isolation test additionally requires `CAN_NONCREDIT_LEARNER_A_*` and `CAN_NONCREDIT_LEARNER_B_*` restricted database credentials and identifiers documented inside that script. Use a disposable Neon branch and explicit, authorized test principals; no owner bypass-RLS login qualifies.

Test both policy modes, multiple versions published after existing enrollment, simultaneous completion events, revoked proof, withdrawn registrations, superseded assessment results, no-lesson policies, no-minute asynchronous courses, and intentionally unapproved baseline administration. The SQL migrations have been committed to `main`, **not applied** to any Neon environment in this phase. GitHub Actions `startup_failure` remains a blocker to claiming passing CI.

## Reusable Phase 1 learner experience

- **Assessment availability is course-participation based**, not dependent on whether a recorded instructor has been selected or any video is available. The shared classroom mounts `NoncreditCourseActivities` for authorized noncredit Course attempts.
- **Recovery:** choice changes are saved as append-only `assessment_response_versions` in the canonical database, with `response_state='saved'`. Resume fetches the latest version for each attempt item and hydrates the shared questionnaire. It never exposes secure answer keys.
- **Retakes:** the published administration's `attempt_limit` plus authorized accommodation allowances determines the attempt budget. The UI displays attempts remaining and hides the retake action once exhausted. Database attempt-limit triggers remain authoritative.
- **Milestones:** a published noncredit completion policy can enable `require_all_lessons`. Learner-marked progress uses `learner_lesson_progress` and creates an unscored, **zero-minute** participation event. The completion database gate verifies all lessons are complete on a single authorized noncredit Course attempt before allowing a completion decision. No self-marked lesson becomes attendance minutes.
- **Status refresh:** the completion panel refreshes after a lesson is marked complete or a knowledge check is submitted. Formal completion remains a separately authorized provider decision and never creates academic records.
- **Existing databases:** the new lesson policy requires `database/canonical/v3.0.1/patch-noncredit-lesson-milestones.sql` to be reviewed/applied on an isolated database before the service can read `require_all_lessons`.

## Supported flow

1. An authorized registrar provisions a canonical `learner_profile` (only when missing) and an `assessment_access_grant` bound to the existing noncredit `learner_course_attempt`. No school Enrollment or Section is created.
2. An approved, published assessment/form version and a single matching open `assessment_administration` are required. The assessment purpose must be `formative`, `practice`, `readiness` or `mastery`, never `official` or `credential`.
3. The learner explicitly starts an attempt. The canonical database enforces the attempt limit, current access grant, question snapshot, and any approved accommodation.
4. The shared `LearningQuestionnaire` displays questions without any answer keys. It currently supports objective single-choice and multiple-choice questions from a fixed, published form. Each answer is persisted in canonical `assessment_response_versions` and `assessment_response_choices`.
5. A restricted server service decrypts each answer key and creates canonical item-level automated scoring decisions. Incorrect answers receive zero points; the entire answer set must match for multi-select questions. It creates an `assessment_attempt_result` with points, fraction and the form's configured pass/fail threshold. This is **knowledge-check evidence**, not a school grade.
6. The result is finalized only when the canonical database allows it. For Phase 1's objective noncredit flow, the additional reviewed database gate permits automatic finalization. Other assessment types retain the original accountable-reviewer requirement.
7. A finalized noncredit assessment can satisfy an approved `noncredit_completion_policy` if it matches the participant, training version and required fraction. Completion still requires separately verified participation time. No browser dwell time, video click or self-attestation is silently converted into credited minutes.

### Security and answer keys

- Configure `CAN_NONCREDIT_ASSESSMENT_KEY_HEX` on the server as a 64-character hexadecimal secret and provision `assessment_item_secure_keys` using `sealNoncreditAnswerKey` in `src/domain/noncredit-knowledge-check.ts`. Store it as a secret, never in source, survey data or client payloads.
- Keys use `can-noncredit-objective-aes256gcm-v1` in `encryption_key_ref`; the bytea payload is `nonce(12) || tag(16) || authenticated ciphertext`, with the item-version UUID bound as additional authenticated data. The private plaintext structure is `{itemVersionId,correctOptionIds}`.
- Published prompts use `assessment_item_versions.item_prompt = {"text":"..."}` and options use `assessment_item_options.display_content = {"text":"..."}`. Other unsupported content types intentionally fail closed.
- Survey responses use the separate, reusable survey engine and never count as scored knowledge-check items.
- Program, deployment, assessment version, current registration, Person identity and course-attempt grant are rechecked server-side. A learner cannot authorize, score or finalize someone else's assessment.

### Controlled rollout (no production mutation performed)

1. Publish the approved, version-pinned noncredit course and assessment, form and encrypted answer keys through the governed content workflow.
2. Verify required canonical database roles and per-resource RLS policies in an isolated test database.
3. Apply `database/canonical/v3.0.1/patch-noncredit-auto-finalization.sql` **only after review and isolated testing** for existing v3.0.1 databases. New clean installs include this gate in the canonical `schema.sql`.
4. Run `npm run typecheck`, `vitest run tests/unit/noncredit-knowledge-check.test.ts tests/unit/noncredit-assessment-boundary.test.ts`, and a disposable-DB acceptance run with two independent learner Persons and a provider registrar. Test revoked access, swapped attempt IDs, missing answer keys, duplicate submit, wrong responses, retry limits, and completed result evidence.
5. Enable `CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED=true` **only** after the SQL and application tests pass. Without the flag, submission remains provisional and a separate provider-authorized command is required to finalize. A pre-migration DB with the flag on rejects finalization and rolls back rather than inventing completion evidence.
6. Verify that `official_course_grades`, `graded_submissions`, academic outcomes and transcript/credit tables remain unchanged. Keep the full official academic assessment path separate.

The initial five-question pilot is content configuration, not a separate hardcoded quiz. Retake counts, passing fraction and time limits are governed by the published assessment form and administration. End-to-end production readiness must not be claimed solely from committed code or GitHub startup failures.
