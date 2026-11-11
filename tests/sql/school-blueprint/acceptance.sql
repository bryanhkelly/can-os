-- Run only on an ephemeral CI Postgres service. No production records touched.
DO $$
DECLARE
  site_a uuid:=gen_random_uuid();
  site_b uuid:=gen_random_uuid();
  person_a uuid:=gen_random_uuid();
  host_a uuid:=gen_random_uuid();
  host_b uuid:=gen_random_uuid();
  plan_a uuid;
  rel_a uuid;
  contact_a uuid;
  campaign_b uuid;
  website_a uuid;
  pack_a uuid:=gen_random_uuid();
  pack_b uuid:=gen_random_uuid();
  version_a uuid;
  adoption_a uuid:=gen_random_uuid();
  failed_ok boolean:=false;
BEGIN
  IF (SELECT count(*) FROM blueprint_catalog_items)<>74 THEN
    RAISE EXCEPTION 'Expected 74 catalog references';
  END IF;
  IF (SELECT count(*) FROM blueprint_catalog_item_versions)<>74 THEN
    RAISE EXCEPTION 'Expected 74 versioned catalog references';
  END IF;
  IF (SELECT count(*) FROM religious_affiliation_options)<>25 THEN
    RAISE EXCEPTION 'Expected 25 affiliation choices';
  END IF;
  IF (SELECT count(*) FROM blueprint_catalog_items WHERE kind='program')<>14 THEN
    RAISE EXCEPTION 'Expected 14 Program reference templates';
  END IF;
  IF (SELECT count(*) FROM blueprint_catalog_items WHERE kind='activity')<>11 THEN
    RAISE EXCEPTION 'Expected 11 Activity reference templates';
  END IF;
  INSERT INTO sites(id) VALUES(site_a),(site_b);
  INSERT INTO people(id) VALUES(person_a);
  INSERT INTO site_local_content_versions(site_id) VALUES(site_a) RETURNING id INTO website_a;
  INSERT INTO curriculum_packs(id) VALUES(pack_a),(pack_b);
  INSERT INTO curriculum_pack_versions(pack_id) VALUES(pack_a) RETURNING id INTO version_a;
  INSERT INTO organizations(id) VALUES(host_a),(host_b);
  INSERT INTO site_blueprints(site_id,created_by_person_id,updated_by_person_id)
    VALUES(site_a,person_a,person_a);
  IF (SELECT religious_affiliation_code FROM site_blueprints WHERE site_id=site_a) IS NOT NULL THEN
    RAISE EXCEPTION 'Self-declared religious identity must default to unselected';
  END IF;
  INSERT INTO site_program_plans(site_id,name,kind,created_by_person_id)
    VALUES(site_a,'Middle School Academy','middle_school',person_a) RETURNING id INTO plan_a;
  BEGIN
    INSERT INTO site_schedule_plans(site_id,program_plan_id,name,timezone,created_by_person_id)
      VALUES(site_b,plan_a,'Invalid cross-site schedule','America/Los_Angeles',person_a);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Cross-Site program plan assignment allowed';END IF;
  INSERT INTO site_host_relationships(site_id,organization_id,role,created_by_person_id)
    VALUES(site_a,host_a,'facility_host',person_a) RETURNING id INTO rel_a;
  IF (SELECT status FROM site_host_relationships WHERE id=rel_a)<>'draft' THEN
    RAISE EXCEPTION 'Host relationship must be unapproved by default';
  END IF;
  failed_ok:=false;
  BEGIN
    INSERT INTO site_host_compensation_terms(relationship_id,payer_organization_id,payee_organization_id,basis,created_by_person_id)
      VALUES(rel_a,host_b,host_b,'fixed_monthly',person_a);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Host compensation could target unrelated payee';END IF;
  INSERT INTO site_concept_contacts(site_id,first_name,last_name,email_normalized,email_digest)
    VALUES(site_a,'Pat','Parent','p@example.net','hash-a') RETURNING id INTO contact_a;
  INSERT INTO site_concept_campaigns(site_id,name,created_by_person_id)
    VALUES(site_b,'Site B Campaign',person_a) RETURNING id INTO campaign_b;
  failed_ok:=false;
  BEGIN
    INSERT INTO site_concept_responses(site_id,contact_id,campaign_id)
      VALUES(site_b,contact_a,campaign_b);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Cross-Site concept response allowed';END IF;
  failed_ok:=false;
  BEGIN
    INSERT INTO site_publication_releases(site_id,revision,status,content_snapshot)
      VALUES(site_a,1,'published','{}'::jsonb);
  EXCEPTION WHEN check_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Unreviewed release could be published';END IF;
  -- The database, not just the application, must reject cross-Site website revisions.
  failed_ok:=false;
  BEGIN
    INSERT INTO site_concept_campaigns(site_id,name,website_revision_id,created_by_person_id)
      VALUES(site_b,'Invalid website revision',website_a,person_a);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Cross-Site campaign website revision allowed'; END IF;
  failed_ok:=false;
  BEGIN
    INSERT INTO site_publication_releases(site_id,revision,website_revision_id,content_snapshot)
      VALUES(site_b,2,website_a,'{}'::jsonb);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Cross-Site publication website revision allowed'; END IF;
  -- The pack version must belong to the selected curriculum pack.
  failed_ok:=false;
  BEGIN
    INSERT INTO site_curriculum_plans(site_id,subject,pack_id,pack_version_id,created_by_person_id)
      VALUES(site_a,'Science',pack_b,version_a,person_a);
  EXCEPTION WHEN foreign_key_violation THEN failed_ok:=true;
  END;
  IF NOT failed_ok THEN RAISE EXCEPTION 'Mismatched curriculum pack/version allowed'; END IF;
  -- A shared multi-course adoption must be reusable across subject plans.
  INSERT INTO curriculum_adoptions(id) VALUES(adoption_a);
  INSERT INTO site_curriculum_plans(site_id,subject,canonical_adoption_id,created_by_person_id)
    VALUES(site_a,'Mathematics',adoption_a,person_a),(site_a,'Science',adoption_a,person_a);
  RAISE NOTICE 'School Blueprint catalog, safety and Site scoping checks passed';
END
$$;
