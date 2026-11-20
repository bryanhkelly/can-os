# CAN OS V6.1 Website Template: Content and Source Contract
Date: November 20, 2026

## Purpose

All seven Website & Brand wireframes present **one** canonical Site identity, one
Site-owned website copy document, versioned Site Brand, and independently
approved Program/Offering/Course/Class and contact projections. They change
**layout**, not the ownership of content or the truthfulness of school claims.

An administrator should be able to answer the following questions for every
page element **without leaving Choose Wireframe**:

1. What section and element is this?
2. Is the heading/text supplied by a saved Site editor, fixed by CAN OS's
   public renderer, derived from Site Story, or read from another approved module?
3. Where is that value edited, and what happens if the source is absent?
4. Does the element always appear, or require a separate publication/review
   gate? Is the preview photo real or illustrative?

The source of truth for the browser-facing guide is
`src/domain/website-template-source-map.ts`. The UI reuses that registry in
`WebsiteTemplateSourceGuide`, shown alongside the selected template and in
Your Content. It does not render source/debug/administrative labels in any
public or privately shared school website.

## Seven templates and their compositions

| Template | Homepage content rhythm | Design-only features |
| --- | --- | --- |
| Heritage Academy | Hero → Vision + Story → Explore → Academics → Learning channels → Enrichment → Community → Closing → Contact | Folio, issue-style masthead, crest |
| Community & Faith | Hero → Story → Enrichment → Community → Vision → Explore → Academics → Learning → Contact → Closing | Welcome strip, open-door stamp, polaroid layout |
| Modern Learning | Hero → Academics → Learning → Explore → Story → Enrichment → Community → Vision → Closing → Contact | Left information rail, fixed tile labels |
| Bright Futures | Hero → Explore → Enrichment → Community → Academics → Learning → Vision → Story → Contact → Closing | Cheerful sticker and illustrated spark |
| Summit Preparatory | Hero → Vision manifesto → Academics → Learning → Story → Enrichment → Community → Explore → Closing → Contact | Cinematic spine, coordinates/cover label |
| Heritage Classical | Hero → Academic pillars and Vision → Enrichment → Community → Story → Explore → Closing → Contact | Collegiate crest and classical utility text |
| Campus Life | Hero mosaic → Story → Enrichment → Community → Explore → Vision → Academics → Learning → Closing → Contact | Journal design, photo mosaic/captions |

The exact displayed sequence, including separately placed closing content blocks,
is computed using `composePublicSiteHome` as the source of truth. The table is
an editorial summary, not an alternative renderer.

## Source labels shown in the editor

| Type | Authoritative data | Where it changes |
| --- | --- | --- |
| Saved identity | Canonical Site and immutable `site_brand_versions` | Establish → Site Profile and Website & Brand → Brand Identity |
| Editable text | Versioned Site-owned website copy `site_local_content_versions` | Website & Brand → Your Content |
| Suggested starting text | `siteStoryV61` fields from saved Purpose & Story; these remain optional and unsaved until reviewed | Establish → Site Information → Purpose & Story; apply in Your Content |
| Approved media | Rights/consent-reviewed Site imagery or saved Brand/logo artwork | Visual Identity → Imagery / Site media folder |
| Published learning | Approved Program, Offering, Course, Class and approved enrollment projection | Owning academic/Program/Enrollment modules |
| Layout and section copy | Saved `websiteContentChannels` configuration, with section headings and placement | Your Content → Arrange website sections |
| Fixed template wording | Renderer-owned H2s, navigation tile labels and visual decorations | Template source code; not editable in Site Story |
| Computed actions | Page eligibility, current publication/registration releases, valid inquiry/application routes | Generated from current authorized records; no second link field |

For example, the homepage Vision **heading** is fixed by the renderer,
while the Vision **paragraph** comes from `schoolVision`. The home Story
section uses `localDescription` first, with explicit fallbacks to the
Site's vision, history and leadership greeting. The H1 uses `heroHeadline`
when saved, or the **exact** Brand display name as a fallback.

`Barton Demo School` therefore stays **Barton Demo School**, including
the word Demo, wherever the canonical name is presented. The demonstration
disclosure is confined to the preview banner; no name rewriting occurs.

## Preconditions, safety and missing data

- An early planning choice in Programs & Audiences may be presented as a
  proposed idea, but it is **not** a published Offering or available enrollment.
- No Site planning timezone, private host identity, affiliation-review state,
  unapproved address, or internal setup status is automatically placed in
  public website copy.
- Academic Programs and Classes use separate, approved publications. Links
  and registration actions require their independent authorizations.
- Unconsented or incomplete imagery is excluded. Template gallery imagery is
  fictional and not persisted into Site assets.
- Empty/optional sections are allowed to disappear. The guide's **When shown**
  text explains these conditions without adding placeholder administrative
  warnings to the actual website.
- Source descriptions apply to the selected template **and page** and are
  informational. They do not grant extra edit, Site approval, publication or
  enrollment capability.

## Acceptance and testing

`tests/unit/website-template-provenance-v61.test.ts` verifies that:
- all seven templates and their presentation notes are covered;
- all homepage section keys are listed exactly once and in the order emitted
  by the actual public template composer;
- every supported interior page has a source map;
- every described element has a source, editing location and display rule;
- the guide renders inside Website & Brand, not in public website HTML.

The registry is an editor explanation; it is not a new publication or
school-content storage model. Changes are confined to PR #355 until tests,
TypeScript, build and browser acceptance pass.
