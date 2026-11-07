# CAN OS School Launch and Run

**Status:** Canonical product contract. Source references below were inspected on `main` at `08a6d832f9b9ba1d5f4d63d8c253cd995c4f34e8`. Source code is **not** authenticated browser, database, or release acceptance evidence.

For family, student, staff and school onboarding in the shared frame, see [Launch Studio Audiences](LAUNCH-STUDIO-AUDIENCES.md).

## User journey

A church or authorized local host is **establishing a school**, not setting up disconnected software. The intended journey is interest and partner authorization → **minimal canonical Site stub** → full-page Launch Hub → independent opening approval → Run dashboard. Creation of the Site stub does **not** create a Program, publish a website, verify a facility, authorize school opening, or fabricate a completed checklist.

A Site Admin manages the local school setup and website, subject to CAN institutional rules, delegated authority, privacy, safeguarding, and jurisdictional constraints. Existing operating schools enter Run, not an involuntary Launch takeover. Configuration remains accessible from Run → Settings.

## Hub structure

The existing module catalog in `src/domain/school-launch-hub.ts` contains **nine cards** in three groups:

| Group | Current card | Source-backed classification |
| --- | --- | --- |
| Establish Your School | School Profile | Operational route |
| Establish Your School | Site Information | Operational route |
| Establish Your School | Website & Brand | Operational route; links directly to the unified Website & Brand Studio |
| Build Your School Community | Invite Your Team | Operational route |
| Build Your School Community | Promote Your School | Explicitly planned landing |
| Build Your School Community | Recruit Families | Explicitly planned landing |
| Build Your School Community | Interest Events | Explicitly planned landing |
| Prepare to Open | Prepare Academics | Operational route |
| Prepare to Open | Opening & Compliance | Operational route |

**Operational route does not mean completed and release-accepted workflow.** Current source declares `promote`, `recruitment`, and `events` as planned modules. Each unfinished capability needs its own intentional, owned landing page, not a missing route, a hidden card, an accidental wizard, or a silent fallback. Academic preparation, family recruitment, team invitations, and compliance are separate workstreams.

## Church Information is a distinct product gap

The existing **Site Information** card describes the school setting and existing school website. It does **not** constitute a complete, separate Church / Local Host Information capability. A host-church identity and relationship model should distinguish the church from the school and support governed church leadership, contact details, website, and relevant social presence. A standalone nondenominational church must not be assigned national denomination controls by default. Denominational academies can receive separately approved network governance and content configuration.

The current nine-card source catalog does **not** contain a separate Church Information card. Treat its creation as a product-to-code gap, not as implemented functionality. Reuse canonical Organization/Site relationships and reviewed publication rules rather than inventing shadow identities or a church-only workflow engine.

See [Website & Brand Studio](WEBSITE-STUDIO.md) for the six-step school identity, website design, preview and publication contract.

## Website & Brand Studio and navigation

The Website & Brand card must enter the unified Studio **directly** for the exact selected Site. Return links and browser Back must preserve Site scope without throwing, cycling through interstitials, or silently selecting another school. Invalid, missing, and unauthorized identifiers require explicit recovery. The Site Admin is the local authority for Site-owned website content; protected institutional claims retain their independent review path.

Website publication, external URL reachability, academic Program publication, admissions eligibility, and legal/safeguarding permission to open are separate facts. No single green card claims the others.

School opening and minor safeguarding are governed by independent [Church-Hosted Safety Gates](../quality/CHURCH-HOSTED-SAFETY-GATES.md); green Hub cards cannot authorize either.

## Status, security, and data

`src/domain/school-hub-status.ts` defines Not Started, In Progress, Complete, Attention Needed, Blocked, Unavailable, and Planned. Read failures must remain **Unavailable**, not silently turn into zero or Not Started. Opening authority is not inferred from Journey completion. A click, demo fixture, or navigation event is not persisted task evidence.

All reads and writes must verify active account, Person, role, relationship, Organization, Site, and Program scope as applicable. Reuse existing domain commands and audit events for Launch and Settings. Do not add fallback records or redundant status machines.

## Launch, Run, and Settings

- **Launch:** Profile, local information, website, staff, academic preparation, community interest, compliance and opening evidence. Tasks can be completed in a sensible order, with independent authorization gates.
- **Run:** Daily learning, families, teachers, site supervision, attendance, communications, records and operational decisions.
- **Settings:** Post-launch configuration using the same canonical modules and persisted records; do not redirect an existing school back through a launch wizard.
- **Sustain/planning:** Periodic health, academic-year and operational planning, without becoming a second school lifecycle.

## Acceptance scenarios (not yet certified)

1. Create an authorized minimal Site stub, refresh, and verify idempotent reentry without implicit Program creation.
2. Open all nine Hub cards and verify distinct owned destinations. Planned cards describe limitations instead of behaving as operational tools.
3. Open Website & Brand Studio, save a draft, return to the Hub, and use Back; Site context and unsaved-change handling remain correct.
4. Test unauthorized, unknown, and invalid Site/Program IDs, including multi-Site users. No automatic alternative Site selection.
5. Confirm Site Admin publishing authority, staff delegations, denied actions and cross-tenant isolation.
6. Force partial read failures; verify explicit Unavailable status rather than false completion.
7. Prove website publication cannot bypass academic authorization, enrollment, opening, or safeguarding gates.
8. Enter an operating school through Run and revisit every setup capability through Settings without a forced Launch redirect.

For every acceptance claim, record exact commit, test environment, isolated database/tenant, observed browser journey, failure cases, and exclusions. **None of these scenarios is claimed passed by this contract.**

## Source pointers

- Hub catalog: `src/domain/school-launch-hub.ts`
- Status: `src/domain/school-hub-status.ts`
- Hub UI: `src/components/launch-studio/SchoolLaunchHub.tsx`
- Module workflow: `src/components/launch-studio/SchoolHubWorkflow.tsx`
- Settings destinations: `src/components/launch-studio/SchoolSettingsDestinations.tsx`
- Routes: `src/routes/launch.hub.school.tsx`, `src/routes/launch.hub.school_.$module.tsx`, `src/routes/launch.hub.school_.new.tsx`, `src/routes/launch.website.tsx`
- [Operating model](OPERATING-MODEL.md), [platform capabilities](PLATFORM-CAPABILITIES.md), [architecture](../architecture/SYSTEM.md), [acceptance standards](../quality/ACCEPTANCE-STANDARDS.md)
- [Archived Launch Hub implementation notes](../archive/2026-11-fullflow/delivery-evidence/school-launch-hub-implementation.md) remain useful dated evidence, **not** current acceptance certification.
