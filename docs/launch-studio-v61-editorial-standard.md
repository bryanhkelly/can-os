# Launch Studio V6.1 editorial standard

Launch Studio should feel like a knowledgeable, encouraging partner helping an organization bring its vision to life. It is one guided experience for schools, churches, community centers, nonprofits, adult learners, older adults, and other program operators.

## Voice and structure

Use friendly, confident, specific, plain English. Avoid hype, patronizing language, warnings piled onto warnings, and developer or architecture terms in primary instructions. Speak about people, experiences, spaces, goals, and actions before talking about system records.

Use a consistent three-layer page hierarchy:

1. **Purpose:** What can the person accomplish or envision here? A compelling question or short title and one brief supporting sentence.
2. **Action:** What should the person do right now? Use direct, contextual guidance, preferably in one sentence.
3. **Context, when needed:** Explain approvals, consent, permissions, regulatory requirements, or dependencies at the point where they change the person's decision.

Do not start a screen with implementation notes. Keep technical lineage, revision numbers, and configuration metadata in expandable details when they are genuinely needed for troubleshooting or expert review.

## Vocabulary

Use **site** for the location or organization setting up activities, **program** for the broad idea chosen in Establish, **experience** for a topic or activity the organization wants to offer, and **solution** for a specific way to deliver a program, with its own operational requirements. Avoid using these terms interchangeably.

Use **people**, **participants**, and **community** in shared journeys. Use **students**, **families**, **school year**, or **church** only where the selected context actually calls for them.

Use **plan**, **materials**, **version**, and **draft** for ordinary outreach tasks. Use Marketing Package and immutable Package Release in internal code and version-specific details where necessary. Keep one coordinated package, one site brand version, and its immutable generated artifacts.

Prefer:
- "What's included" to "published Solution model"
- "Your current preparation status" to "latest requested Site-scoped records"
- "Review what's needed to open" to "collect evidence and request independent opening decisions"
- "Who would you like to reach?" to "Primary Who"
- "Nothing has been sent" to "a selected channel is not evidence of delivery"

## Audience adaptation

Keep shared workflows consistent. Use Site Information and saved site context to tailor optional prompts or helpful suggested text. Faith-related stories, denomination, and spiritual formation belong in an optional group rather than generic questions for secular organizations. Do not infer endorsement, accreditation, funding, permissions, operational readiness, or offered programming from planning interests.

## Safety and trust

Preserve actual approvals, content and image consent, publisher authority, and readiness requirements. Be explicit when a decision matters. A shareable preview is not public publication, website publication does not open program registration, and saving a plan does not approve an offering. Do not make these warnings the dominant text of every step.

Errors should explain the problem and the next safe action. Loading and empty states should be short, truthful, and helpful. Do not imply a failed request succeeded or that inaccessible evidence is absent.

## Review requirements

When adding or changing Launch Studio pages, review page title, subtitle, field labels, help, buttons, selection cards, empty, loading, error, permission-limited, success, and completed states. Check a school, faith-hosted program, and a non-school community or older-adult program.

Update source tests whenever intentional copy changes. The targeted regression suite is `tests/unit/launch-studio-editorial-contract.test.ts`. Keep new active screens in its `activeScreens` list, and add banned implementation-facing phrases when drift is discovered. This is a guardrail, not a replacement for human copy review.

No new CMS, storage layer, compulsory wizard step, or change to operational authority is required for copy realignment.
