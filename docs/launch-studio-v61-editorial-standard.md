# Launch Studio V6.1 editorial standard

Launch Studio should feel like a knowledgeable, encouraging partner helping an organization bring its vision to life. It is one guided experience for schools, churches, community centers, nonprofits, adult learners, older adults, and other program operators.

## Launch Studio journey

The four navigation stages are **Shape → Share → Prepare → Launch**.

- **Shape**: Define the Site's identity, Programs, audiences, Experiences, Brand and private website.
- **Share**: Tell the story, invite participation, and create outreach plans. Private preview sharing is not website publication.
- **Prepare**: Select solutions, plan operational resources, and meet applicable requirements.
- **Launch**: Review what is ready and open individually authorized offerings and registration when eligible.

The stage names are user-facing navigation, not new workflows. Retain existing route and module IDs (`site-profile`, `create-outreach`, `program-catalog`, `open`), saved content, permissions, independent approvals and consent. The `open` module is displayed as **Launch**; this never implies a blanket Site-wide authorization.

## Voice and structure

Use friendly, confident, specific, plain English. Avoid hype, patronizing language, warnings piled onto warnings, and developer or architecture terms in primary instructions. Speak about people, experiences, spaces, goals, and actions before talking about system records.

Use a consistent three-layer page hierarchy:

1. **Purpose:** What can the person accomplish or envision here? A compelling question or short title and one brief supporting sentence.
2. **Action:** What should the person do right now? Use direct, contextual guidance, preferably in one sentence.
3. **Context, when needed:** Explain approvals, consent, permissions, regulatory requirements, or dependencies at the point where they change the person's decision.

Do not start a screen with implementation notes. Keep technical lineage, revision numbers, and configuration metadata in expandable details when they are genuinely needed for troubleshooting or expert review.

## Vocabulary

Use **site** for the location or organization setting up activities, **program** for the broad idea chosen in Shape, **experience** for a topic or activity the organization wants to offer, and **solution** for a specific way to deliver a program, with its own operational requirements. Avoid using these terms interchangeably.

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

## Canonical Site identity

**Site identity** is declared in Shape → Site Information → Hosting & Organization and saved as `sites.metadata.siteIdentityV61`. It is intentionally distinct from the responsible organization, hosting arrangement, tax status, affiliation, audience and Program intent. A church may host a secular afterschool Site; a faith-based school may use another organization's facilities.

Site identity records a Site type, whether faith is part of its identity, and an optional faith tradition. These are self-reported planning answers, not affiliation, recognition or approval. Do not infer identity from host type, tax status, audience or a network.

The existing `projectSiteContentBriefV61` projection exposes `identity` to the authorized Website & Brand and Share read paths. Website & Brand uses it to tailor Tell Your Story prompts and faith fields; already saved faith copy remains editable when classification changes. Church-specific source suggestions are only offered to church Sites. Share uses the same identity for **consented, operator-reviewed** starter suggestions and the guided outreach draft. Existing user-authored or released materials must not be regenerated silently.

Old Sites with no saved identity retain all their records and receive an unclassified default, never a guessed religious identity. The Site Information step asks for a classification at the next edit. Identity changes update the Site revision so existing outreach plans can indicate that their source context changed. No new database table, duplicated content store, or operating authorization is introduced.

## Truthful state and source language

Keep **saved outreach plans**, **working material previews**, and **complete downloadable material releases** distinct. The review step saves a plan; creation of coordinated materials is a later action. Do not tell users that materials are ready unless a complete downloadable release is known. If release history cannot be loaded, say so rather than treating it as empty.

Follow Up links currently open Site-wide inquiries and interest-event records. Do not imply responses were tied to a specific outreach unless actual attribution exists. Saving a plan, choosing a format, generating materials, sending communications, publishing the website, and opening registration are separate actions.

Never say suggested website text came from "the latest Site plan" if a particular refresh only derives wording from the saved Site name and broad learning profile. Label the specific source used. Site type guides website prompts and outreach drafting, while Program and audience interests guide suggested learning focus.

The Program Catalog's Shape context includes both broad interest IDs and selected Program codes. Showing an empty interest state when Program codes exist is incorrect. Published Program names are preferable to raw internal codes.

Keep approval warnings next to publication, review and registration decisions. Ordinary preparation and editing pages should focus on what the person can accomplish next.

## Safety and trust

Preserve actual approvals, content and image consent, publisher authority, and readiness requirements. Be explicit when a decision matters. A shareable preview is not public publication, website publication does not open program registration, and saving a plan does not approve an offering. Do not make these warnings the dominant text of every step.

Errors should explain the problem and the next safe action. Loading and empty states should be short, truthful, and helpful. Do not imply a failed request succeeded or that inaccessible evidence is absent.

## Review requirements

When adding or changing Launch Studio pages, review page title, subtitle, field labels, help, buttons, selection cards, empty, loading, error, permission-limited, success, and completed states. Check a school, faith-hosted program, and a non-school community or older-adult program.

Update source tests whenever intentional copy changes. The targeted regression suite is `tests/unit/launch-studio-editorial-contract.test.ts`. Keep new active screens in its `activeScreens` list, and add banned implementation-facing phrases when drift is discovered. This is a guardrail, not a replacement for human copy review.

No new CMS, storage layer, compulsory wizard step, or change to operational authority is required for copy realignment.
