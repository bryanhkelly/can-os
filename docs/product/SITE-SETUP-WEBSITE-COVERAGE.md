# Site Setup to website-template coverage

Status: source audit and implementation, 2026-11-16. No successful CI/build/live browser proof.

## Invariant

Every persisted Site-first choice has an authorized Site-owned data home, and
the canonical website renderer can place that data in each of seven templates.
Site Setup selections are not evidence of legal authorization, educational
publishing rights, site qualification, or permission to enroll.

## Complete Site Setup inventory

| Input | Persisted authority | Native website destination | Public rule |
| --- | --- | --- | --- |
| Site name | sites.name | Global header/footer; private site.setup block | Public when Site published |
| Responsible organization | sites.organization_id linked to organizations.name | Global identity/footer; private site.setup | Public as verified responsible organization only |
| City and state | sites.metadata.schoolPlanningLocation | Private site.setup block | Not a verified public address |
| Time zone | sites.timezone | Private site.setup block and verified Class Session time formatting | Not a public schedule by itself |
| Physical / digital / both | sites.metadata.launchPreferences.delivery | Private site.setup block | Intent only; approved Program/Class delivery separate |
| Network request and review | site_affiliations with HQ approval/revocation status | Private site.network block | No public branding from mere affiliation |
| Grades 6-8 | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Grades 9-12 | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Afterschool | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Weekend | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Summer / breaks | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Evening | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Adult learning | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |
| Senior programs | launchPreferences.interestIds | Private learning.interests item | Not an actual Program |

## Educational records after setup

Reviewed academic Program records -> learning.academics, subject to
existing approved public catalog and independently verified admissions.
Published enrichment -> learning.enrichment. Eligible noncredit releases
-> learning.noncredit, with registration only from release eligibility.
Unified native Classes -> learning.classes, but ONLY when the public
Class Offering has published public visibility, the exact public/canonical
Site correspondence is independently approved, the Class is active,
Course/Offering publishing and Deployment/adoption remain authorized, and
all current Site/operator relationships are valid. The next future
noncancelled Session may display in the Site's time zone. The Class
channel has no public room, roster, staff or registration shortcut.

## Seven template placements

Heritage, Community, Modern, Bright Futures, Summit, Classic and Campus
all compose Site-owned channels in three native template placements:
Learning, Community and Closing. These are template-owned presentation
slots and source-owned block content, never route-specific HTML overlays.

V1 block settings upcast to V2 on read and preserve existing editorial
titles and choices while providing newly registered Site and Class channels.
Operators can still deliberately disable or remove an individual block;
the source values remain in their authoritative Site records.

## Release acceptance required

1. Run npm run typecheck, npm run test:site:channels, npm run build:cloudflare.
2. On a disposable authorized QA database, save each Site Setup selection,
   leave/reopen the workflow, and verify the saved values remain exact.
3. For all seven templates and all three delivery modes, confirm private
   preview shows the correct Site, responsible org, planned location, time
   zone, affiliation state, and all eight independent planning interests.
4. Verify public output contains none of those unverified planning claims
   and never exposes pending/rejected/revoked network affiliation.
5. Under an approved Site identity link, confirm public Class card eligibility,
   future Session formatting, and revocation/closure/migration-negative cases.
6. Verify private/unlisted Classes and classes without Class Offerings
   never appear on an anonymous Site. No new Class registration link is implied.
7. Match the deployed Cloudflare release fingerprint to the tested commit.

No production database mutations are part of this mapping implementation.
