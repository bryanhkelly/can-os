# Ask CAN Agent Platform

## Purpose

Ask CAN is the primary way people interact with CAN OS, not a feature inside it. Every parent, student, teacher, administrator, and operator has an intelligent assistant capable of operating the school software on their behalf — within their exact authorization context.

The prototype ([academy-union-core](https://github.com/bryanhkelly/academy-union-core): `AskCanDrawer.tsx`, `ask-can-data.ts`, `CAN-OS-build-spec.md`) is the interaction reference. Its philosophy is preserved; its implementation (scripted responses over demo data, localStorage conversations, confirm buttons that execute nothing) is replaced by production infrastructure.

## Architectural stance

The platform is three **modules inside the modular monolith**, not three deployed microservices. Each module has a capability interface that makes it independently extractable when a measured requirement justifies it (see Service extraction below). Per the core architecture: one Neon PostgreSQL system of record, transactional outbox for events, one authorization layer.

```text
Ask CAN conversation (web, mobile, external agents)
  Natural language · workspace context · user preferences
        |
Intent and planning layer
  Ask · Do · Watch · Manage
        |
Agent Runtime (module)
  Tool registry · permissions · approvals · execution state · scoped memory
        |
Domain modules (same interfaces the UI uses)
  Academics · Attendance · Communication · Actions · Enrollment · Journeys
        |
Event & Subscription (module)
  Standing instructions · triggers · recurring schedules · delivery · escalation
        |
Neon PostgreSQL — one data model, one audit trail
```

The chat interface never knows how assignments are stored or notifications delivered. It knows which authorized capabilities exist and how to invoke them. Every capability is simultaneously available to the conventional UI, internal agents, and (later) permitted external agents.

## Interaction model: Ask / Do / Watch / Manage

One conversation, four interaction types. Users speak naturally; CAN identifies intent and presents confirmation when required. No mode tabs.

| Type | Example | Resolves to |
|---|---|---|
| **Ask** | "How is Bobby doing in Biology?" | Authorized read over canonical records, with evidence |
| **Do** | "Schedule a meeting with his teacher." | Human-approved domain mutation via existing services |
| **Watch** | "Tell me when Bobby misses an assignment." | Durable `Subscription` (standing instruction) |
| **Manage** | "Every Friday, summarize his progress." | Recurring durable workflow (scheduled agent run) |

A conversation produces **real objects in the operating system**, never text buried in chat history. A monitoring rule becomes an editable Subscription visible under "Things CAN Is Watching"; a scheduled summary becomes a visible recurring workflow. Parents can inspect, modify, pause, or revoke anything CAN does on their behalf.

## System 1: Conversation

Durable, server-side conversations replace localStorage state.

```text
Conversation
  personId, workspaceContext (organization/site/program/section/student)
  status, createdAt, lastActiveAt

ConversationMessage
  conversationId, role (user | agent | system)
  body, evidenceRefs[] (canonical record links)
  actionPreviews[] (pending approvals), deepLinkTarget
  agentRunId nullable
```

Invariants:

- **Evidence over assertion.** Agent answers attach references to canonical records (submission, grade, attendance event). The UI renders them as verifiable links.
- **Fresh-record rule.** An agent never treats earlier generated responses as authoritative facts. Follow-up turns re-query current authorized records (see Proactive conversations).
- Agent conversations are distinct from human `CommunicationThread`s. "Message the teacher" produces a CommunicationThread; Ask CAN never impersonates a human channel.
- Workspace-specific history: conversations are scoped to the user's workspace context and persist across sessions/devices.

## System 2: Agent Runtime

The runtime turns intent into authorized execution.

```text
AgentRun
  conversationId, personId, intent (ask | do | watch | manage)
  status (planning | awaiting_approval | executing | completed | failed | cancelled)
  plan (tool call sequence), executionState
  approvedAt, approvedByPersonId nullable

ToolInvocation
  agentRunId, toolName, arguments, resultRef
  authorizationContext (capability + resource + scope + relationship snapshot)
  status, error
```

Rules:

1. **Same authorization layer as every other client.** Every tool invocation is evaluated as `capability + resource + scope + relationship`. The agent has no privileges the person doesn't have; it acts *as* the person, with delegation recorded.
2. **Confirmation before consequential action.** Do/Manage intents produce an action preview; execution requires explicit human approval. Read-only Ask intents do not.
3. **Every tool invocation and approval writes an AuditEvent.** "The agent did it" is always reconstructable to person, conversation, approval, and authorization context.
4. **Scoped memory.** Agent memory derives from durable domain objects (subscriptions, conversations, preferences) — not an unbounded vector of past chats. Sensitive-tier records (medical, counseling, discipline, family financials) are excluded from agent context unless the person holds that field access *and* the run's purpose requires it.
5. **Tool registry, not free-form code.** Tools are typed, server-side functions over domain modules. The LLM plans; the runtime executes deterministically.
6. Proactive AI enters the product as Insights and subscription-driven nudges — never as unsolicited chat (consistent with the domain model).

## System 3: Event & Subscription

The durable-watch engine. This is what makes "tell me when Bobby misses an assignment" a platform capability rather than a chat promise.

```text
Subscription
  subscriberPersonId
  eventTypes[]                 -- e.g. [AssignmentBecameMissing]
  subjectType / subjectId      -- e.g. studentProfile: Bobby, or scope filter
  filter                       -- sections, severity, unexcused-only, etc.
  reminderPolicy               -- e.g. remind after 24h if unresolved
  channel                      -- in_app | email | sms | agent_webhook
  status (active | paused | revoked), expiresAt nullable
  createdVia (conversation | ui), sourceConversationId nullable

SubscriptionDelivery
  subscriptionId, domainEventId, channel
  status, attempts, lastError, deliveredAt
  authorizationSnapshot        -- re-checked at delivery time
```

Processing reuses the existing transactional outbox and domain-event worker:

1. Domain mutation + DomainEvent commit in one transaction (existing).
2. Outbox worker claims the event (existing; see hardening notes below).
3. Subscription matcher finds active subscriptions for the event type and subject scope.
4. **Authorization is re-evaluated at delivery time** — a subscription never acts as a cached permission. If the GuardianRelationship was revoked, delivery is suppressed and the subscription flagged.
5. Delivery routes to the channel. In-app uses the existing Notification policy layer; email/SMS/agent_webhook go through a delivery worker with retry, dedup, quiet hours, and consent enforcement (per notification-architecture.md).
6. Reminder policies ("remind me next day if still missing") are scheduled follow-up checks against *current* canonical state — the reminder fires only if the condition still holds.

Delivery invariants:

- Every SubscriptionDelivery is idempotent on `(subscriptionId, domainEventId)`.
- Failed deliveries retry with backoff; terminal failure creates an ops Action, never a silent drop.
- Recipients can always see *why* they were notified (event + deep link) and can manage the subscription that caused it.

## Proactive conversations

Subscriptions can continue an existing conversation instead of emitting isolated alerts:

> CAN: Bobby missed his Biology assignment yesterday. I notified him, but it remains incomplete.
> Parent: Has this happened before?
> CAN: This is his third overdue Biology assignment this month. Two were eventually submitted. His current grade is 78%.
> Parent: Should I talk to the teacher?
> CAN: I can prepare a message to his Biology teacher summarizing the missing work. [preview]
> Parent: Do that. → approval → CommunicationThread created via the Communication module

Requirements this imposes:

- A subscription delivery may carry `conversationId`, so the event arrives *in context* and the thread retains the evidence chain.
- Each turn re-queries canonical records under fresh authorization ("third this month" is computed at answer time, not remembered).
- The transition notify → analyze → act must not cross module boundaries in the chat layer; the agent runtime invokes the same capabilities the UI would.

## Relationship to existing primitives

| Existing primitive | Role in the agent platform |
|---|---|
| `DomainEvent` + outbox | The only source of agent-visible facts and subscription triggers |
| `Action` | Approvals, escalation, and human work created by agents or policies |
| `Insight` | System-generated observations that agents surface with evidence |
| `Notification` | In-app delivery channel for subscription deliveries |
| `CommunicationThread` | Human-to-human messages an agent prepares but a human approves |
| `AuditEvent` | Every agent invocation, approval, and delivery |
| `Journey` | Manage-type recurring workflows reuse the readiness engine rather than a new scheduler where the work is requirement-shaped |

## Golden Flows

The platform is validated by three flows (full definitions in golden-flows.md):

- **GF-A1** — Parent asks CAN about academic progress: grounded, permission-aware answers with evidence.
- **GF-A2** — Parent tells CAN to monitor missing assignments: durable subscription, autonomous alert, reminder, revocation-safe delivery.
- **GF-A3** — Parent asks CAN to contact a teacher: cross-module coordination with human approval.

GF-A flows run *after* the flows they observe (GF-A2 depends on GF1's `AssignmentBecameMissing`), but the platform foundations (conversations, agent runtime, subscriptions) are built as platform primitives alongside the initial release, not deferred to the end.

## Service extraction

The three modules are the natural first service boundaries — in this order, each with a measured trigger:

1. **Event & Subscription delivery** — extract when channel volume (email/SMS/webhook) or retry isolation demands independent scaling.
2. **Agent Runtime** — extract when external agents require separate authentication, rate limiting, and blast-radius isolation from the app.
3. **Conversation** — extract last, if at all; it is read/write coupled to identity and audit.

Extraction moves the process boundary, not the data ownership: Neon remains the system of record, the outbox remains the integration mechanism, and the authorization model is shared verbatim. No Kafka or distributed event platform is introduced for v1.

## Implementation status

| Component | Status | Location |
|---|---|---|
| Event & Subscription (schema, matcher, delivery, reminders) | Implemented | `src/platform/subscriptions/`, `src/db/schema/subscriptions.ts` |
| Outbox hardening (claiming, backoff, escalation, health) | Implemented | `src/workers/domain-event-worker.ts` |
| Conversation store | Implemented | `src/db/schema/conversations.ts` |
| Agent Runtime (tool registry, approval gates, audit) | Implemented, deterministic planner | `src/platform/agent/` |
| Server boundary + UI | Implemented | `src/modules/conversation/ask-can.functions.ts`, `src/routes/ask.tsx`, `src/routes/guardian.watching.tsx` |
| LLM planner | Deferred | Replaces `planTurn` behind the same contract |
| Email/SMS/webhook subscription channels | Partially (email via existing helper) | delivery worker with quiet hours/consent still open |
| Conversation-continued deliveries (proactive threads) | Not yet | subscription deliveries land as notifications, not chat messages |
| Sensitive-tier exclusions in agent context | Structural (tools query only academic records) | field-level policy still open |

## Outbox hardening

Agents act on what they're told; a duplicated or lost event is a duplicated or lost parent notification. The worker ([src/workers/domain-event-worker.ts](../src/workers/domain-event-worker.ts)) now guarantees:

1. **Claim locking** — `FOR UPDATE SKIP LOCKED` batch claiming with a 10-minute lease; crashed claims are reclaimed after lease expiry.
2. **Retry with backoff + terminal handling** — failed events retry with exponential backoff up to 5 attempts, then escalate to a high-priority ops Action (`outbox_event_failed`) instead of sitting `failed` forever.
3. **Unhandled-type surfacing** — `getOutboxHealth()` reports pending events with no registered handler, failures, and in-flight processing for monitoring surfaces.
