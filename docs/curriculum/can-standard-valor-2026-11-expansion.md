# CAN Standard / Valor School curriculum expansion — November 10, 2026

**Data state:** Neon project `sweet-hall-62441909`; Valor synthetic organization UUID `f1000000-0000-4000-8000-000000000002`. All changes described here are **unpublished, unapproved draft course versions**. This is a working content data set for CAN OS demonstration and content review, not an operational school launch, accreditation claim, or transcript-credit determination.

## Database work completed

- The existing 32 `CAN-*` core course templates each have one newly created `course_template_versions` draft, identified by `md5('can-standard-2026-11-working-draft:' || code)::uuid`. **No existing published course version was rewritten.**
- Each course draft holds a 36-week provisional syllabus and `learning.blueprint`, nine thematic units and 180 five-day lesson-framework records. Database totals: **32 course drafts; 288 units; 1,152 planned weeks; 5,760 draft lesson records; 1,152 weekly assignment templates**.
- Each lesson contains learning targets, an original teacher-reviewable prompt, three activities with estimated durations, an exit-ticket prompt, and a discussion/response task. Weekly assessment templates provide two discussion questions and a suggested 25-point analytic rubric.
- Course drafts contain approximately **300 external resource links**, including **10 hand-selected YouTube introductory video links**, chiefly from CrashCourse. They are *links to external resources*, not owned or downloadable CAN media. Most lessons still need a topic-matched video or reading chosen and verified individually.
- **Algebra I** draft retains the five substantial original pilot lessons and associated teacher-only answer guide from published v2, adapted to the new Unit 1. **English 9**, **Biology** and **U.S. History** include five more substantive original demonstration lessons each. The English example uses public-domain `Romeo and Juliet`, linked to Project Gutenberg. U.S. History's first week references Native Knowledge 360° and insists on distinct community voices, source criticism, and context. Biology's source-based evidence assignment uses **explicitly synthetic data**, not alleged student observations.
- `CAN-BIBLE` and `CAN-LEAD` are tagged `source.optionalCommunityOverlay=true`. They should be optional community/faith content and must **not** be treated as universal CAN academic requirements.
- Existing Valor sections, enrollments, grades, lesson-progress data, published course releases, curriculum entitlements and adoptions have not been changed by this expansion.

## What is present vs. what remains

| Capability | Current working draft | Required before instructional release |
| --- | --- | --- |
| Course catalog and syllabus | 32 courses, 9 units each, 36 planned weeks | State-specific scope/sequence and calendar review |
| Daily learning content | 180 structured **frameworks** per course; 20 stronger subject-specific lessons across Algebra I, English 9, Biology and U.S. History | Full teaching narratives, worked examples, leveled readings, lab protocols, differentiation, accommodations and educator review |
| Assignments and discussions | 36 **templates** per course with prompts and a suggested rubric | Teacher-authored gradebook assessments, discussion threads, feedback, due dates, exam security and actual section enrollment mapping |
| Media | Source-library links and 10 selected introductory video links | Chapter/lesson matching, rights and embedding checks, link monitoring, transcripts/captions, playback testing |
| Teacher guides | Algebra I first-week protected guide carried forward | Complete answers and misconceptions/interventions for every reviewed course and unit |
| Alignment and approval | `standards=['ALIGNMENT-PENDING']`, `creditStatus='not_credit_ready'`, `reviewStatus='planning'` | Verified CCSS/NGSS/appropriate jurisdictional framework crosswalk, teacher/academic approval and independent credit governance |
| Publishing and adoption | All 32 versions in **draft**; original live sections unchanged | Controlled pack version, release, entitlement/adoption and progress migration only through authorized workflows |

**Integrity checks on November 10:** 32 drafts; all with 36-week roadmaps; 5,760 unique lesson IDs within their courses; no lesson lacking structured activities; no invalid non-HTTPS source links detected; 0 mismatched syllabus blueprint titles. All statuses remain `draft`. These checks are structural, not evidence of educational quality.

## External resources and content rights

The newly authored learning-framework and sample texts are original demonstration drafts. They **do not copy** third-party full chapters, videos, exercises, assessments, or proprietary answer keys. Sources are linked externally. A source being free to read does not mean CAN can rehost, adapt, or charge for redistribution.

- OpenStax textbook reuse policy: https://help.openstax.org/s/article/Openstax-textbook-licensing-and-customization — currently CC BY-NC-SA; obtain commercial permission where needed, and check edition-specific terms.
- CK-12 terms: https://help.ck12.org/hc/en-us/articles/51042851054235-CK-12-Terms-of-Use — restrict commercial aggregation and automated derivative creation. Do not import or scrape CK-12 works.
- Khan Academy terms for links and embeds: https://support.khanacademy.org/hc/en-us/articles/202262954-Can-I-use-Khan-Academy-s-videos-name-materials-links-in-my-project
- Project Gutenberg public-domain `Romeo and Juliet`: https://www.gutenberg.org/ebooks/1513
- Smithsonian Native Knowledge 360°: https://americanindian.si.edu/nk360/
- HHMI BioInteractive and educational limitations: https://www.hhmi.org/terms-of-use
- Consumer Financial Protection Bureau K-12 financial education materials: https://www.consumerfinance.gov/consumer-tools/educator-tool/youth-financial-education/
- CrashCourse official media: https://thecrashcourse.com/

License clearance must attach to each individual resource before rehosting. Video URLs remain external and subject to provider embed restrictions and removal.

## Recommended next passes, in priority order

1. **Replace framework placeholders with authentic subject instruction**, starting with the four existing Valor classroom courses (Algebra I, English 9, Biology and U.S. History), then the remaining core progression. A generated long paragraph is not the same as validated pedagogy.
2. Complete protected educator guides, fully worked solutions, multiple-question formative checks, labs or simulations, multimedia and accessible alternatives.
3. Link *every* selected reference to a specific module/week/lesson with attribution, resource type, rights identifier, verified status, title, duration, captions, and link-health monitoring.
4. Map each instructional objective to the applicable state or national standards (not merely generic `ALIGNMENT-PENDING`), credit-hour/competency requirements and local calendar.
5. Establish explicit differentiated support: reading and math readiness diagnostics, below-grade-level intervention pathways, accommodations and extension work.
6. Move publisher-owned CAN Standard drafts into a controlled independently owned CAN curriculum pack rather than relying permanently on Valor's historical synthetic publisher ownership. **Do not rewrite current course ownership or existing published releases in place.**
7. Test publishing, adoption, classroom rendering, protected guide access, YouTube/Vimeo/R2 playback, teacher assignment creation, discussion participation and immutable progress migration on a disposable or accepted demo branch **before release**.

## Operational warning

The curriculum additions were inserted as draft JSON records directly into Neon; this document is the audit manifest, **not** a runnable seed or backup. Before modifying or restoring the demo database, export the exact course draft JSONs into a version-controlled curriculum asset bundle and verify import idempotency in an isolated test branch. Do not treat drafts as equivalent to academically approved curriculum solely because they contain a full-year skeleton.
