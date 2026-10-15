# Profiles → compliance evidence → school configuration (foundation)

## Release boundary

This introduces person-level education and credential history, source-linked compliance evidence, policy-versioned requirements, and Program-scoped configuration versions. This is a **schema and pure-rules foundation**, not a completed accreditation submission, authenticated profile editor, verified integrations, or launch approval UI.

## Profiles

- **One Person** is the anchor for teacher, paraprofessional, admin, coach, site leader, student and volunteer identities. RoleAssignment determines who may serve in a capacity and where. PersonProfileDetails is biographical presentation, not authorization.
- EducationHistory records colleges/universities, degrees, majors, graduation year, reported/completed state and independent verification. Never display self-reported degrees as verified.
- PersonCredentials records CPR, first aid, AED, teaching licenses, child safety training, clearances, and other credentials. Verification status, evidence document, issuer, jurisdiction and expiration must be explicit.
- A student uses StudentProfile and the same person-owned education/credential records when relevant. Academic transcripts/grades remain authoritative elsewhere; do not duplicate them in EducationHistory.
- No birth dates, medical diagnoses, fingerprint details, government identifiers, or raw background-check results belong in the general-purpose profile.
- Protect credential documents, private contact details, disciplinary, medical and student records using capability + scope + relationship + field sensitivity checks. These schema definitions do **not** grant read access.

## Evidence

ComplianceRequirement is versioned by external framework and can be scoped to jurisdiction, organization, site or program. A requirement may filter relevant RoleAssignments by roleKeys. ComplianceEvidence maps a specific subject to the specific applicable requirement and references an existing Document, PersonCredential or canonical operational record. Review and expiration are separate from collection.

A passed accreditation evidence checklist is **not** itself accreditation: only the accreditor or regulator can determine standing. Requirements are configurable; do not invent universal state certification rules.

Evidence lifecycle target: submitted → under_review → accepted | rejected | expired, preserving history on resubmission. Reviewers need scoped authorization; evidence must be reproducible and provenance-aware. Full lifecycle APIs, audit events, temporal requirements, privacy tests, and evidence export are follow-on work.

## School configuration

SchoolConfigurationVersion belongs to the existing Program, preserves versioned choices and stores only an explicit operating model, grade range, instruction delivery, services, funding model, and a responsibility matrix. The critical owners include instruction, supervision, attendance, safeguarding, and records. A missing owner blocks readiness. Approved configurations should require policy validation and emit versioned audit events before activating.

Suggested operating models: church_hosted, school_extension, microschool, consortium, network. These are configurations, **not separate codebases**.

## Golden-flow acceptance scenarios (next build)

1. Synthetic paraprofessional claims CPR, uploads evidence, verifier validates credential; readiness changes only when verified, with expiration alert.
2. Synthetic teacher adds university/degree/license; another school can view verified claims only with authorized access.
3. Synthetic high-school extension configures Grade 9–12, two onsite days and asynchronous/online learning; supervisory and safety owners must be assigned.
4. Site produces a requirement-specific accreditation evidence package containing provenance and reviewer signoff. Authorized network operators see only their scoped schools.
5. All changes produce DomainEvents/AuditEvents, synthetic Neon fixtures, role isolation and Playwright golden-flow coverage before use with real people.

## Profile explorer slice

- The `/profiles` route is a **synthetic, non-persistent** role/profile explorer. It intentionally exposes no real identity or credential documents.
- `profile-access.ts` provides defense-in-depth preconditions for future server-side readers and verification services. **This is not sufficient resource authorization by itself**: each service must validate actual actor membership and target person's relationship to the scoped organization/site/program before returning any private field.
- Existing data schema changes remain un-migrated until Drizzle migrations are generated, reviewed and executed against the synthetic Neon environment.
- Next: implement authenticated server-side profile reads/writes and verification audit events, ensure person/role scoping, then connect school configuration readiness to evidence-backed qualifications.
