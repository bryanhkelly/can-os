# Synthetic Neon Quick Wins — Release 1

## Implemented

The `/student/experiences` page loads an authoritative student Actions panel via `getQuickWinActions`, scoped to the reserved **synthetic** Jordan Example identity and Site.

- `scripts/seeds/student-quick-wins.sql` seeds three repeatable Actions: open essay recovery, open math support, and resolved conference follow-up.
- `finishQuickWinAction` transitions an open Action to resolved, recording resolution time and note.
- `requestQuickWinHelp` creates a new synthetic Action in production Neon.
- The route refreshes the loader after mutations, so saved changes remain visible after navigation/reload.
- No database migration is needed. Existing Actions and StudentProfile models are reused.

## Demo reset

The deterministic fixture can be reinserted (without duplication) by rerunning `scripts/seeds/student-quick-wins.sql`. Note that `ON CONFLICT DO NOTHING` preserves mutations; it **does not** reset the rows to original status. To reset, use a controlled synthetic-only maintenance step selecting the reserved fixture IDs and setting their initial statuses. Do not reset unrelated records.

## Deliberate boundaries

The remaining Quick Wins cards are interactive client-side scenarios, clearly labeled as non-persistent. The server functions contain a hardcoded synthetic identity, **not** a production user authentication model. The fixture is for developer/demo use only.

## Follow-on increments

1. Convert the existing mock Needs You list to the persisted Actions component and remove duplicate queue surface.
2. Make Site calendar exceptions and announcement acknowledgements durable.
3. Add teacher-side support request triage and reply.
4. Make extension requests and approvals explicit workflows.
5. Add seeded FL/WA Site personas and more households.
6. Add automated SQL-backed smoke checks on a disposable Neon branch.
