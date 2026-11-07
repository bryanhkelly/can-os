# CAN OS convergence — contract changelog
Integration I · started 2026-11-03 · source snapshot: `main`

## 2026-11-03 — Stage 0, proposed coordination contracts
- **Established:** `CODE_BASED_SOURCE_MAP.md` from inspected source; existing source-of-truth and ownership boundaries captured.
- **Confirmed:** Site creation currently submits organization/name/slug/timezone but not `sites.address`. S owns input/mutation work; I arbitrates changes to shared tables.
- **Confirmed:** Parent DTO has approved-display/provenance gates but still leaves address/contact, tuition/aid, admissions explanation, disclosures and family portal unconfigured. A owns safe adapters.
- **Confirmed:** A single Site-wide timetable is intentionally withheld with multiple academic Programs; C/A must preserve independent Program schedules, including Sunday.
- **Confirmed:** Site publication, Program marketing, application eligibility and opening authority are separate decisions; no cross-domain inference or new lifecycle enum.
- **Confirmed:** public renderer `public-site-html.ts`, Site editor and authorized operations scope are existing integration targets, not replacements.
- **Not approved yet:** any new table, column, migration, DTO extension, permissions, runtime claim or public marketing fact. All change requests above remain proposals pending owner implementation and I review.
- **Merge gate 1:** S/C/P deliver canonical changes; validate migrations in isolated Neon branch. Gate 2: A approved DTO. Gate 3: B/D public site and complete family path. Gate 4: end-to-end launch → named handoff → operations.
- **Compatibility:** no runtime code change in this Stage 0 commit; docs alone do not complete integration or release acceptance.

## Log format for subsequent merges
Date · branch/PR/commit · workstream · files and actual types changed · migration / rollback · readers updated · approval proof · smoke path · collisions / limitations.
