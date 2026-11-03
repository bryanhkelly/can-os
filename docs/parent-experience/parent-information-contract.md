# Parent information contract (PX-001–PX-007)

**Authority:** This is a read-model inventory, not a CMS or legal approval. The public projection uses only institutionally authorized objects or independently published church-owned copy. `not_configured` means **do not advertise**. Source revisions and publication gates remain controlled by the owning module.

| Parent question / claim | Canonical owner/source | Edit / approve | Visibility and status | Parent fallback / invalidation |
| --- | --- | --- | --- | --- |
| School name and organization | Site / Organization; Site publication | Authorized site/organization admins; Site publisher for public access | Public when Site published | Withhold unpublished Site; read live name |
| School address and public contact | Site and separately institution-reviewed public identity envelope | Site admin / institutional publisher | Display only with exact-current signed public review, school-controlled channel attestation and unexpired approval | Withdraw automatically when source/review changes |
| Church history, welcome, mission | Site local content versions | Church website editor; protected institutional claims require CAN review | Published local revision only | Omit blank copy; versioned publication |
| Statement of faith / formation | Site local content versions | Church website editor | Published local revision only | Omit; never infer denomination |
| Grades, ages, academic programs | Program and approved ProgramPublication | Program authority / institutional publisher | Public with snapshot parity, Site membership and live agreements | Hide stale/revoked programs on next read |
| Curriculum / instructional model | Program published summary | Academic publisher | Approved marketing copy; not a curriculum guarantee | No fabricated curriculum or credentials |
| School days, start/end times, hybrid locations | C signed `approvedProgramSchoolDays` with legacy uniform fallback | Academic/operations schedule authority | Signed Program/year revision, effective dates, seven-day intervals (including split periods); only one reviewed uniform Program gets Site-wide legacy display | Omit if missing/ambiguous; no default Monday–Friday or invented holiday calendar |
| Leadership and staff introductions | Existing self-consented public staff bios + exact publisher review | Institutional publisher and consent owner | Current staff consent + publication + active Site relationship; never read protected HR data | Omit people entirely |
| Enrichment and activities | Enrichment catalog from Activity / Season / Registration | Authorized enrichment publisher | Public only through Site and offering gates | Hide inactive/revoked; registration eligibility separate |
| Meals, transport, before/after care | Reviewed Site family-services metadata | Site operations + institution | Institutionally reviewed current evidence, with explicit planned/not-offered labels | Expiry/revision invalidates claims |
| Tuition, aid, fees | Institution-wide/Program-level public fee and aid policy source (model request outstanding; household obligations are not sufficient) | Finance authority / institutional publisher | Not configured | No estimated tuition, aid or affordability claims |
| Admissions, Apply | Canonical D `resolvePublishedFamilyStartDestination` | Registrar / institutional authority | Program-specific verified application starts only; not a seat or enrollment guarantee | Recheck at POST; distinct inquiry/visit controls |
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
- Calendar, staffing and application-start gates: approved per-Program schedules, signed publisher review and consented public staff are re-evaluated from current authoritative sources; inactive or changed claims are withheld. Finance/aid and affirmative school-specific legal claims still require their own public-safe authoritative records.
- A public host being reachable is not a publishing or operating authorization.

## Contract handoffs

B: consume `PublicParentSchoolProfile` and `projectApprovedParentInformation` in the existing public-site rendering pathway, without bypassing `readPublishedSiteCatalog`; keep church story distinct from institutional facts.

C: integrate #255 signed `approvedProgramSchoolDays` source, including Program identity, year-limited effective dates and split instructional periods. Do not convert jurisdiction research into school-specific legal claims.

D: retain canonical application-start and POST rechecks; strengthen actual admissions window and opening/legal conditions separately. Finance + I own missing approved tuition/aid policy source and family portal handoff remains authenticated.

**Current implementation boundary:** `readPublishedParentInformation(slug)` returns the read-model through the live Site catalog; public HTML and private previews consume its approved-only claims. Public identity publisher review has a separate route `/sites/$siteId/parent-information`, but finance/aid/verified institution-specific legal sources still require Integration I and C/Finance ownership. No schema change or production migration is required by Agent A.
