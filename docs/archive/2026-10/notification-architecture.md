# CAN OS notification and action strategy

The legacy [CAN OS demo communication area](https://can-os-demo.netlify.app/communication) illustrates a useful interaction model: one coordination center with escalations, messages, meetings, records, support desk, notifications, urgency, and links to related records.

## Adopt
- Unify actionable work under the canonical `actions` table. The notification is the signal, not a second task state.
- Expose **Needs You** queue by actor/scope with overdue and urgency filters; retain a unified inbox for messages and record-linked notices.
- Link to the real authorized resource; unsupported resource targets must not silently fall back to unrelated pages.
- Use domain events to create notifications and actions; avoid independent duplicated workflows and unbounded alerts.
- Prefer personal in-app notifications; schedule digest/email delivery only after account preferences, consent, quiet hours and deduplication exist.
- Acknowledge, snooze, assign, resolve and reopen should be actions on canonical records, with an audit trail.
- Never put student counseling, medical or disciplinary details in a generic push/email preview.

## Phase 1
A synthetic-only `/operations` workspace aggregates supported existing action records. It does not enable writes or authentication, and never opens a public data directory. Shared navigation links to it. Prioritize authenticated read scope and notification-to-action lifecycle before adding external delivery channels.

## Preview limitations
Current student notifications are scoped to a fixed synthetic person and have limited deep-link handling. A production implementation must perform actor and recipient authorization at the server boundary, pagination/cursors, explicit resource routing, and unread aggregation across authorized affiliations. The historical demo's counts and network metrics are demonstration data, not live CAN OS evidence.
