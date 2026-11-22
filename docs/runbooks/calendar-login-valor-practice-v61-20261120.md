# CAN OS V6.1 Calendar access and Valor practice feedback

Branch: `feature/platform-admin-catalog-blueprints-20261120`
Target: PR #355 into `main`

## Calendar login

`/calendar` checks the existing verified workspace session before showing event
details. Missing/expired authentication redirects to `/access`, with the original
path, date, and event query protected by `safeAccessReturnTo`. An authenticated
viewer without permission to see a particular event still receives "Event
unavailable", not a misleading sign-in prompt. Transient session errors are not
treated as a signed-out state.

## Build identity

The `/access` form footer retains the first 12 characters of the
Vite-embedded Git SHA and displays the build target and UTC build timestamp.
Its reusable, collapsed `BuildDiagnosticsFooter` also shows the full Git SHA,
browser hostname and a checked-on-demand comparison against the independent
`/release-fingerprint` server revision. Copy diagnostics includes only these
public release identifiers. A failed/invalid server probe is shown as
unavailable, not silently assumed to match. The check runs only on expansion,
not on every anonymous login render.

Both Vite configurations embed `__CAN_SOURCE_REVISION__`,
`__CAN_BUILD_TIMESTAMP__` and `__CAN_BUILD_TARGET__`. These are build
metadata, not proof of the active Neon project/branch, database credentials,
deployment promotion or operating authorization. Public diagnostics must
never expose database endpoints/branches, account details, or URL query
parameters; resolving the active database binding remains a separate
authenticated infrastructure investigation. If provenance was not embedded,
the footer says `unavailable` instead of inventing a build number.

## Valor draft assessments and teaching feedback

- Jordan's existing 12 canonical assessment administrations remain `draft`.
  Their existing synthetic short-response prompts are separately available
  for **unscored practice**, guarded by exact CAN student, synthetic Site,
  active Class Enrollment and current Course Attempt.
- Practice answers persist to `public.formative_practice_attempts` and
  `education_v30_secure.formative_practice_responses`. The ordinary
  `assessment_access_grants`, `assessment_attempts`, `grading_decisions`
  and Course publication engines are not written by this path.
- Riley's approved specific Class teaching assignment permits him to inspect
  current learner practice answers and return written practice feedback,
  optionally with a 0-10 *practice-only* score. He may similarly review real
  synthetic homework in the current Class/Course Attempt. The learner sees
  saved attempts and returned feedback in the same Class tabs.
- The returned feedback is explicitly synthetic/noncredit and uses the
  existing private response JSON and shared canonical audit writer. This does
  not appoint Riley as an independent official grader, grant academic credit,
  change assessment publication, or reuse Section-based gradebooks.
- A former homework insertion path dropped synthetic markers for live
  Jordan submissions. It now preserves the synthetic practice provenance
  only when both the exact Valor Site and learner Person are marked
  synthetic.

## Verification and remaining gates

Source changes and contract tests were committed. There is no verified
passing production bundle, TypeScript result, authenticated browser test,
restricted RLS acceptance, or Cloudflare deployment for this exact branch SHA.

For a **published** knowledge check, a separate publisher review,
form/item publication, authorized administration, and individual learner
assessment access remain necessary. For **official grades**, a verified
independent grader appointment, grading policy, and institutional authority
remain necessary. Synthetic practice must not be represented as satisfying
those regulatory or educational requirements.
