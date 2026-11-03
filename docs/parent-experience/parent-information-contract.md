# Parent information contract (PX-001–PX-007)

**Authority:** This is a read-model inventory, not a CMS or legal approval. The public projection uses only institutionally authorized objects or independently published church-owned copy. `not_configured` means **do not advertise**. Source revisions and publication gates remain controlled by the owning module.

| Parent question / claim | Canonical owner/source | Edit / approve | Visibility and status | Parent fallback / invalidation |
| --- | --- | --- | --- | --- |
| School name and organization | Site / Organization; Site publication | Authorized site/organization admins; Site publisher for public access | Public when Site published | Withhold unpublished Site; read live name |
| School address and public contact | Site and verified public contact projection (not connected) | Site admin / institutional publisher | Not configured | Omit rather than expose private contacts |
| Church history, welcome, mission | Site local content versions | Church website editor; protected institutional claims require CAN review | Published local revision only | Omit blank copy; versioned publication |
| Statement of faith / formation | Site local content versions | Church website editor | Published local revision only | Omit; never infer denomination |
| Grades, ages, academic programs | Program and approved ProgramPublication | Program authority / institutional publisher | Public with snapshot parity, Site membership and live agreements | Hide stale/revoked programs on next read |
| Curriculum / instructional model | Program published summary | Academic publisher | Approved marketing copy; not a curriculum guarantee | No fabricated curriculum or credentials |
| School days, start/end times, hybrid locations | Canonical calendar/schedule (adapter outstanding) | Academic/operations schedule authority | Not configured pending reviewed schedule projection | Omit; seven-day support; no default Monday–Friday |
| Leadership and staff introductions | Approved public staff bios (adapter outstanding) | Institutional publisher and consent owner | Not configured; never read protected HR data | Omit people entirely |
| Enrichment and activities | Enrichment catalog from Activity / Season / Registration | Authorized enrichment publisher | Public only through Site and offering gates | Hide inactive/revoked; registration eligibility separate |
| Meals, transport, before/after care | Operational service records (adapter outstanding) | Site operations + institution | Not configured | Never infer from setup switches |
| Tuition, aid, fees | Institutional financial obligations / approved public price projection (outstanding) | Finance authority / institutional publisher | Not configured | No estimated tuition, aid or affordability claims |
| Admissions, Apply | Canonical admissions/operating authority (complete CTA adapter outstanding) | Registrar / institutional authority | Closed by default in this new projection | Inquiry may remain separate; no open-apply inference |
| Operating authorization, accreditation, licensure | Effective-dated jurisdiction + institution-approved disclosure (outstanding) | Compliance / institutional publisher | Not configured | Never call marketing approval operating authorization |
| Safeguarding / safety policy summary | Institution-approved summary (outstanding) | Safeguarding owner / institutional publisher | Not configured | Withhold internal incident, custody and medical records |
| Family portal / next steps | Authenticated family workflow (handoff outstanding) | Registrar / guardian access service | Authenticated family only | No public portal token or household data |

## Claim contract

Each public claim carries its projected value, owning source category, optional source revision, intended audience, state and server-computed `canDisplay`. Only public `verified` or `available` claims with an approved value and source can be displayed. `planned`, `stale`, `withdrawn`, `not_offered` and `not_configured` are non-displayable. The `availability: operating` marketing label on an existing approved academic listing is **not** itself legal authorization or admissions approval.

## Invalidation ownership

- Site publication withdrawal: `readPublishedSiteCatalog` fails closed using a publication-row shared lock.
- Program identity/grade/delivery change: reviewed-snapshot parity; program/site/organization changes and service-agreement revocation: program listing is withdrawn from live reads.
- Enrichment season/registration changes: the existing enrichment catalog recomputes public availability.
- Church content: the currently published content revision is re-read; unreviewed drafts are not included.
- Calendar, tuition, staffing, admissions and jurisdiction changes: **no public snapshot is created yet**. Owners must supply fresh domain-specific gated reads or effective-dated reviewed projections before these values are rendered.
- A public host being reachable is not a publishing or operating authorization.

## Contract handoffs

B: consume `PublicParentSchoolProfile` and `projectApprovedParentInformation` in the existing public-site rendering pathway, without bypassing `readPublishedSiteCatalog`; keep church story distinct from institutional facts.

C: implement approved public adapters for seven-day school schedules, onsite/remote distinctions, operational services, activities summary extensions and evidenced effective-dated jurisdiction disclosures.

D: implement verified admissions window/capacity/jurisdiction checks and institution-owned tuition/aid projection; expose a distinct safe Apply decision and family portal handoff.

**Current implementation boundary:** `readPublishedParentInformation(slug)` returns the new read-model using the existing live-gated catalog. It is not yet wired into existing public HTML/routes, and its unconfigured fields do not represent product completion. No schema change or production migration is required for this slice.
