-- Partner church website editor fixture for /site-website. Synthetic-only,
-- idempotent and partial-application safe. Apply ONLY to an isolated
-- disposable Neon branch, AFTER the base seeds (student-s1-s4.sql,
-- identity-demo-accounts.sql). Never run against real data.
BEGIN;

-- Editor identity (.invalid only). Site-bound partner membership: capability
-- surface is limited to site.website.draft.read + site.website.local.publish;
-- no student, family, academic or admissions access.
INSERT INTO people (id, legal_first_name, legal_last_name, preferred_name, email, metadata)
VALUES ('fd000000-0000-4000-8000-000000000010','Emery','Example','Emery',
 'emery.website@can-os.invalid',
 '{"synthetic":true,"fixture":"site-website-editor-v1","role":"site_website_editor"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO access_accounts (id, email_normalized)
VALUES ('fd000000-0000-4000-8000-000000000011','emery.website@can-os.invalid')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants
(id, account_id, person_id, role, organization_id, site_id)
VALUES ('fd000000-0000-4000-8000-000000000012','fd000000-0000-4000-8000-000000000011',
 'fd000000-0000-4000-8000-000000000010','site_website_editor',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- requirePartnerWebsiteEditor needs BOTH an org membership and an explicit
-- Site-scoped (program_id NULL) site_website_editor role assignment whose
-- capabilities contain the required capability.
INSERT INTO memberships (person_id, organization_id, title, metadata)
VALUES ('fd000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000002',
 'Synthetic church website editor','{"synthetic":true}'::jsonb)
ON CONFLICT (person_id, organization_id) DO NOTHING;
INSERT INTO role_assignments
(id, person_id, organization_id, site_id, program_id, role_key, capabilities, metadata)
VALUES ('fd000000-0000-4000-8000-000000000013','fd000000-0000-4000-8000-000000000010',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',NULL,
 'site_website_editor',
 '["site.website.draft.read","site.website.local.publish"]'::jsonb,
 '{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Shared publication dependencies, identical rows to
-- public-family-admissions-v1.sql and independently idempotent, so this seed
-- is safe whether or not that seed has already been applied. A reserved
-- (published here) public address is required before local copy can be saved,
-- and the published Program snapshot feeds the read-only academic catalog.
INSERT INTO site_publications (site_id, slug, status, published_at)
VALUES ('f1000000-0000-4000-8000-000000000003','synthetic-bay-campus','published',now())
ON CONFLICT DO NOTHING;
INSERT INTO program_publications
(program_id, site_id, status, title, summary, grade_range, delivery_model,
 approved_by_person_id, published_at)
VALUES ('f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003',
 'published','Synthetic Hybrid High School',
 'Synthetic demonstration high school listing for fixture verification only.',
 '{"min":"9","max":"12"}'::jsonb,
 '{"onsite":true,"asynchronous":false,"liveOnline":false,"onsiteDaysPerWeek":5}'::jsonb,
 'f1000000-0000-4000-8000-000000000006', now())
ON CONFLICT DO NOTHING;

-- Published revision 1 of church-owned local copy. Plain text only: no markup,
-- no student data, no prices and none of the protected institutional claims in
-- src/domain/site-local-content.ts, so classifySiteLocalContent returns
-- status 'published' with no flagged fields.
INSERT INTO site_local_content_versions
(id, site_id, revision, status, content, flagged_fields, created_by_person_id)
VALUES ('fd000000-0000-4000-8000-000000000014','f1000000-0000-4000-8000-000000000003',
 1,'published',
 jsonb_build_object(
  'welcomeMessage','Welcome from the Synthetic Bay church family. We are glad you stopped by.',
  'localDescription','Synthetic Bay Campus is hosted by our demonstration church community. Families gather here through the week for worship, friendship and learning support.',
  'denomination','Synthetic Demonstration Fellowship (fictional)',
  'statementOfFaith','We believe in God the Father, in Jesus Christ His Son, and in the Holy Spirit. This synthetic statement exists only to exercise the website editor fixture and describes no real congregation.',
  'spiritualFormation','Our community meets for prayer, Scripture reading and service projects. Children join age-appropriate gatherings alongside their parents.'
 ),
 '[]'::jsonb,'fd000000-0000-4000-8000-000000000010')
ON CONFLICT DO NOTHING;

COMMIT;
