-- Global safety credential catalog entries for the existing signed R2
-- qualification claim -> independent review -> expiry/revocation workflow.
-- These definitions alone do not confer clearance or school-opening authority.
INSERT INTO "public"."qualification_definitions"
  ("key","kind","title","schema_version","attributes_schema")
VALUES
  ('onsite_child_safety_screening','credential',
   'Onsite child-safety screening',1,'{}'::jsonb),
  ('onsite_safeguarding_training','credential',
   'Onsite safeguarding training',1,'{}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
