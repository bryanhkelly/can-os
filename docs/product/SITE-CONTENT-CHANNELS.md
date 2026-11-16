# Site-owned content channels

## Source and presentation are separate

The original private Launch Studio preview appended a white Program section after
the fully rendered website. That page-specific HTML injection has been removed.
Now the Site owns a versioned content-channel configuration. Each block selects
a known data channel, a location and a presentation. The Site renderer composes
the block within its selected design, consistently across all seven templates.

Configured content sources:
- learning.interests: private planning intents from the Site, never publicly enrollable.
- learning.academics: independently reviewed Site academic catalog.
- learning.enrichment: published Site enrichment catalog.
- learning.noncredit: separately eligible noncredit releases tied to the Site.

Each block contains a bounded ID, channel, placement (learning/community/closing),
layout (cards/list/featured), enabled flag and safe editorial labels. Blocks
never store Course, enrollment, tuition, student, approval or registration data.
No arbitrary HTML, external URL or javascript can be supplied through block settings.

## Ownership and publication

Draft configuration: sites.metadata.websiteContentChannels.
Public snapshot: sites.metadata.publishedWebsiteContentChannels.

An authorized Site operator can change the draft, protected by an exact-Site
grant, optimistic revision check, database lock and audit event. The private
Site preview always reads the draft. A separate authorized Site website
publisher can publish a snapshot. The public Site uses that snapshot only.
Without a snapshot it uses safe defaults. Planned interests never render
anonymously, even if present in a published snapshot.

Actual content is always pulled from current approved Site data. Publishing a
presentation block is not a permission to open a school, publish an Offering,
register a learner, use a network logo or bypass independent classroom grants.

## Rendering and extensibility

Site content channels are resolved by source adapters and passed as typed
projections to the canonical Site renderer. The seven template compositions
contain matching learning, community and closing slots. The renderer uses
each template's typography and palette, including a dark presentation for
the Modern Learning template used by Valor School.

The editor is part of the private Site-first Studio preview. It adds/removes
source channels, changes headings, layout and placement, saves private changes
and refreshes the preview. The separate publish action rechecks publisher
permission. It requires no new database table or migration.

## Verification gate

Source-level unit and contract tests cover source isolation, theme composition
and public versus private channel behavior. A Cloudflare build, authenticated
two-Site acceptance and a matching deployed SHA remain mandatory before the
live implementation can be considered verified.

## Enrollment-aware multi-page channels (November 2026)

The same approved content source can now appear in more than one presentation block. Site block IDs remain unique, while channel IDs can repeat. Blocks can target Home, Programs, Courses, Classes, Academics or Student life, and may specify permitted enrollment target types, source order/title/upcoming sort and bounded item limits. Launch Studio allows reordering, duplication and independent private save/public publication.

A new `learning.opportunities` channel combines approved School, Program, Course and Class public discovery and source-verified next actions, without creating new enrollment records. It defaults disabled to avoid duplicate existing Course/Class homepage sections. The shared Site renderer composes three new interior pages with the existing seven templates. For scope, safety and remaining issues, see [Site enrollment-driven websites](SITE-ENROLLMENT-DRIVEN-WEBSITES.md).
