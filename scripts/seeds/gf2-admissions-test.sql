-- GF2 synthetic admission fixture. Apply ONLY to an isolated disposable Neon branch.
-- Idempotent; never modifies already changed test records.
INSERT INTO households (id,display_name) VALUES
('f9000000-0000-4000-8000-000000000001','GF2 Synthetic Test Family') ON CONFLICT (id) DO NOTHING;
-- Preserve one canonical household across guardian and student workspaces.
INSERT INTO household_memberships
(id,household_id,person_id,relationship_label,is_primary_contact) VALUES
('f9000000-0000-4000-8000-000000000007',
'f9000000-0000-4000-8000-000000000001',
'f3000000-0000-4000-8000-000000000007','Guardian',true),
('f9000000-0000-4000-8000-000000000008',
'f9000000-0000-4000-8000-000000000001',
'f1000000-0000-4000-8000-000000000005','Student',false)
ON CONFLICT (household_id,person_id) DO NOTHING;
-- Morgan's guardian relationship must be canonically verified and
-- enrollment-managing so the declared /guardian/admission-offers interactions
-- (view issued offer, accept or decline) are executable. Same fixed ID as the
-- calendar fixture keeps this idempotent whichever seed runs first.
INSERT INTO guardian_relationships
(id,guardian_person_id,student_person_id,relationship_label,can_view_academics,can_manage_enrollment,metadata) VALUES
('f3000000-0000-4000-8000-000000000008','f3000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000005','parent',true,true,
'{"synthetic":true,"fixture":"gf2-test","verification":"verified"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO journey_definitions (id,key,version,audience,title) VALUES
('f9000000-0000-4000-8000-000000000002','gf2-synthetic-enrollment',1,'family','GF2 Test Enrollment') ON CONFLICT (id) DO NOTHING;
INSERT INTO applications (id,household_id,student_profile_id,program_id,stage,idempotency_key,submitted_by_person_id,submitted_at,metadata) VALUES
('f9000000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-000000000001',
'f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000004',
'application','gf2-test-app-1','f3000000-0000-4000-8000-000000000007',now(),
'{"synthetic":true,"fixture":"gf2-test"}') ON CONFLICT (id) DO NOTHING;
INSERT INTO journeys (id,type,status,participant_type,participant_id,organization_id,site_id,program_id,journey_definition_id,definition_version) VALUES
('f9000000-0000-4000-8000-000000000004','enrollment','ready','application',
'f9000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002',
'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004',
'f9000000-0000-4000-8000-000000000002',1) ON CONFLICT (id) DO NOTHING;
INSERT INTO journey_requirements (id,journey_id,key,title,status,blocking,completed_at) VALUES
('f9000000-0000-4000-8000-000000000005',
'f9000000-0000-4000-8000-000000000004','guardian-consent','Guardian consent','complete',true,now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admission_seat_pools (id,program_id,school_year_id,capacity) VALUES
('f9000000-0000-4000-8000-000000000006',
'f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000009',2)
ON CONFLICT (id) DO NOTHING;
