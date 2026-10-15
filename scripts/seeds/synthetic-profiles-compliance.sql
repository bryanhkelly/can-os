-- Synthetic CAN OS qualifications, no real student or employee data.
-- Apply only AFTER reviewed Drizzle migrations exist. Never run against real-data environments.
BEGIN;
INSERT INTO people (id, legal_first_name, legal_last_name, email, active)
VALUES
 ('c3200000-0000-4000-8000-000000000001','Sarah','Example','synthetic.teacher@example.invalid',true),
 ('c3200000-0000-4000-8000-000000000002','Jordan','Example','synthetic.para@example.invalid',true),
 ('c3200000-0000-4000-8000-000000000003','Taylor','Example','synthetic.reviewer@example.invalid',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO qualification_definitions (id,key,kind,title,schema_version,attributes_schema)
VALUES
 ('c3210000-0000-4000-8000-000000000001','safety.cpr','certification','CPR / AED',1,'{}'),
 ('c3210000-0000-4000-8000-000000000002','education.bachelors','degree','Bachelor Degree',1,'{}'),
 ('c3210000-0000-4000-8000-000000000003','teaching.state_license','license','Teaching License',1,'{}'),
 ('c3210000-0000-4000-8000-000000000004','safety.child_protection','training','Child Protection Training',1,'{}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO qualification_claims (id,person_id,definition_id,issuer_name,issued_at,expires_at,details)
VALUES
 ('c3220000-0000-4000-8000-000000000001','c3200000-0000-4000-8000-000000000001','c3210000-0000-4000-8000-000000000001','Synthetic CPR Issuer','2026-01-01','2027-01-01','{"synthetic":true}'),
 ('c3220000-0000-4000-8000-000000000002','c3200000-0000-4000-8000-000000000001','c3210000-0000-4000-8000-000000000002','Example University',null,null,'{"degree":"B.S.","major":"Biology","synthetic":true}'),
 ('c3220000-0000-4000-8000-000000000003','c3200000-0000-4000-8000-000000000002','c3210000-0000-4000-8000-000000000004','Synthetic Provider','2026-08-01','2027-08-01','{"synthetic":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO compliance_frameworks (id,key,name,authority)
VALUES ('c3230000-0000-4000-8000-000000000001','can.synthetic-staff-readiness','Synthetic Staff Readiness','CAN Development Only')
ON CONFLICT (key) DO NOTHING;
INSERT INTO compliance_framework_versions (id,framework_id,version,status)
VALUES ('c3240000-0000-4000-8000-000000000001','c3230000-0000-4000-8000-000000000001','2026-demo','draft')
ON CONFLICT (id) DO NOTHING;
INSERT INTO compliance_policy_rules(id,framework_version_id,code,description,expression,evidence_policy)
VALUES ('c3250000-0000-4000-8000-000000000001','c3240000-0000-4000-8000-000000000001','SYNTH-CPR','CPR or BLS for synthetic demo','{"op":"any","rules":[{"op":"credential","type":"safety.cpr"},{"op":"credential","type":"safety.bls"}]}','{}')
ON CONFLICT (framework_version_id,code) DO NOTHING;
COMMIT;
