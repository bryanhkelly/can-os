# CAN OS V6.1: Establish Experiences

**Branch:** release-11212026
**Location:** Launch Studio / Establish / Programs & Audiences / Experiences
**Verification:** Source implemented; no build, typecheck, browser, or accessibility acceptance executed in this environment.

## Three V6.1 pages

1. **Explore topics.** Browse 12 groups and 78 topic options; select no more than five total across groups, including legacy custom choices. Suggest relevant topics based on Site Programs and audiences, but don't prohibit other choices.
2. **Make them yours.** For each selected topic choose up to four predefined activity chips, up to three outcomes, associated selected audiences and Programs, and one Featured / Planned / Exploring status. No narrative writing is required.
3. **Review vision.** Show generated planning-stage website copy, selected scope, priority, and an Edit choices action. Operators proceed through the existing Save & Continue action.

All three are internal views of the canonical V6.1 GuidedSetupShell Establish step. They are not competing top-level routes.

## Source of truth and website behavior

| Concern | Source |
| --- | --- |
| Groups, topics, curated chips | src/domain/site-experience-interests.ts |
| Site selections and typed associations | sites.metadata.launchPreferences |
| Authorized saving and hard 5-topic limit | src/modules/programs/site-programs-audiences-v61.functions.ts |
| Three responsive V6.1 pages | src/components/launch-studio/EstablishExperiencesV61.tsx |
| Generated homepage and Experiences-page cards | src/domain/site-content-channels.ts |
| Published copy frozen on authorized website publication | sites.metadata.publishedSiteExperienceCardsV2 |
| Published experience selection provenance | sites.metadata.publishedSiteExperiencePreferencesV2 |

The existing 14 topic IDs remain valid. No new DB tables or migrations are required. Old plans with over five choices remain readable; operators explicitly reduce selections to five before their next save.

An Experience is a proposed Site aspiration, not a Solution adoption, scheduled Class, verified activity, or permission to enroll. Public Experience cards remain unchanged when Establish planning data changes, until an authorized publisher explicitly republishes the website section. Public pages without a published Experience snapshot show no Experience cards.

## Acceptance checklist (not yet executed)

- Browse all 12 groups and choose topics across unrelated groups.
- Select five, verify a sixth is unavailable, deselect one, and select another.
- Select four activity chips and three outcome chips; confirm no additional choice until deselection.
- Associate selected Experiences with current audiences, Program interests, and published Program references.
- Save, reload and verify selections, associations, and status survive the Site row round trip.
- Check legacy custom names count toward five and legacy plans are never silently truncated.
- Preview both homepage and /experiences. Confirm generated text says activities are proposed and does not offer unauthorized enrollment.
- Publish, edit Site planning chips, verify public copy is frozen while private preview changes, then explicitly republish.
- Check responsiveness, keyboard/screen-reader behavior, design system, component tests, TypeScript and app build.

## Focused tests

- src/domain/site-experience-interests.test.ts
- src/domain/site-experience-website.test.ts
- src/domain/site-experience-v2.test.ts
