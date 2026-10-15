# Student Quick Wins Suite — first release

Route: `/student/experiences`. Source: `src/components/student/StudentQuickWins.tsx`.

## Included interaction scenarios

The release ships labeled, fictional scenario records for:
- Universal Needs You queue across coursework, permission slips, messages, and conferences.
- Contextual action drawer with source, due date, next action and completion.
- Site calendar, schedule moves/cancellations, unified classes, meetings, chapel and athletics.
- Site/network announcements, audience label, and acknowledgement.
- Student help request form with a local request history.
- Teacher office hours selection.
- Assignment extension request (request only; it does **not** alter deadlines).
- Absence catch-up reading/lesson/meeting checklist.
- Student milestones, light-weight streak preview, growth/portfolio prompts.
- Student-selectable task priority, today/this-week switch and work filters.
- Teacher feedback represented by the linked Student Today view.
- Calendar subscription design placeholder (does **not** expose an unprotected ICS feed).
- Student check-in and next-action pathways.

## Boundaries

**Current environment assumption:** CAN OS Neon records are currently all synthetic development fixtures; there is no real student, parent, or school operational data in this database. This allows iterative schema, seed, and command testing against the connected Neon environment, provided fixtures remain deterministic and resettable.\n\nThis is an **interactive synthetic UI release**. The suite holds ephemeral React state only; resets restore the baseline. No request, extension, acknowledgement, calendar change, milestone, or portfolio action is persisted to Neon. That is intentional: operational records need an authenticated identity and relationship-aware write commands.

Existing production tables (Actions, CalendarEvents, ConsentRecords, Communications, etc.) remain the intended source of truth. There is no schema migration in this UI iteration. The preexisting synthetic student fixture in `scripts/seeds/student-s1-s4.sql` remains intact and idempotent.

## Next connection work

1. Persist Needs You via Action and JourneyRequirement commands.
2. Implement Site event exception mutations and downstream notification fan-out.
3. Link help requests to a scoped teacher or academic coach Action.
4. Make extension approval a versioned per-student due date override.
5. Persist office-hour bookings and handle double booking.
6. Provide personal calendar subscription tokens with revocation.
7. StudentPortfolioArtifact for selective sharing with a review gate.
8. Test source permissions and school-specific rules before accepting actual student requests.

Acceptance: `npm run typecheck`, `npm test`, route navigation, keyboard controls, reset scenario, no live student records modified.
