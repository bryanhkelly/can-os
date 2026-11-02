# Evidence presentation contracts

Import from `@/components/evidence`.

- `EvidenceUploader<T>` owns file/expiry input, pending state, and private PUT retries. Its adapter `begin` and `finish` must call the workflow's existing authorized server functions. `makeInput` supplies the domain-specific command payload.
- `EvidenceReviewForm` accepts `onReview(decision, reason)`. The server validates reviewer independence, reason, version and permission.
- `EvidenceWorkflow`, `EvidenceStatus`, and `EvidenceHistory` render server-provided status, rejection reasons, and version history; they never derive authorization.
- `WorkflowPrerequisites` and `WorkflowHandoff` render canonical prerequisites and handoff state for launch, admissions and academic workflows.

Integration: Agents C/D/E should pass already-authorized server responses and their domain-specific mutation callbacks, not recreate approval records or eligibility checks in React.

Do not pass download URLs directly to the browser without the existing authorized download command.
