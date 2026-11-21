# CAN OS V6.1: Establish Experiences

**Branch:** release-11212026
**Location:** Launch Studio / Establish / Programs & Audiences / Experiences
**Verification:** Source implemented; no build, typecheck, browser, or accessibility acceptance executed in this environment.

## Three V6.1 pages

1. **Explore all topics.** All 78 topic chips appear exactly once, in twelve always-visible category panels with a distinct wayfinding icon for each. Recommended topics appear highlighted and starred *inside their category*, not in a second navigation menu, and are never auto-selected. Selected blue chips stay visible in a removable summary row. At five, unselected chips disable until one is removed. Search does not clear selections.
2. **Make them yours.** Only the selected Experiences appear in the five-topic strip and expandable cards. For each topic choose up to four activities and three outcomes, associate audiences and Programs, and set Featured / Planned / Exploring using a compact status chip in the *left side of each card's header*. Generated website copy previews inline. There is no separate Review step.

Both are internal views of the canonical V6.1 GuidedSetupShell Establish / Programs & Audiences / Experiences step. The owning ActionFooter shows the Make These Experiences Yours action on Explore and Save & Continue to Website & Brand after personalization. Operators with no choices may skip Experiences. The outer step navigation stays unchanged.

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
