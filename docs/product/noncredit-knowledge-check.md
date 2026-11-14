# Noncredit knowledge checks in the shared CAN OS classroom

**Scope:** Phase 1 private organizational learning; reusable for adult, summer, workforce and other authorized noncredit offerings. No new routes, navigation, grading, academic credits, transcript, or credential issuance.

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
