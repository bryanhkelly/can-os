\set ON_ERROR_STOP on
-- Optional native Class capability extension to existing canonical assessment
-- model. Apply after patch-canonical-assessment-draft-authoring.sql on isolated QA.
-- NO parallel review, assessment, scoring or results tables.
BEGIN;
DO $policy$
DECLARE old_def text; existing text[]; code_list text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO old_def
 FROM pg_constraint WHERE conrelid='education_v30.database_role_organization_bindings'::regclass
 AND conname='database_role_organization_bindings_purpose_code_check';
 IF old_def IS NULL OR old_def NOT LIKE '%purpose_code%' THEN
   RAISE EXCEPTION 'Review database-role purpose codes before patch';
 END IF;
 SELECT array_agg(DISTINCT m[1]) INTO existing
 FROM regexp_matches(old_def, '''([^'']+)''::text', 'g') m;
 IF coalesce(array_length(existing,1),0)<10 THEN
   RAISE EXCEPTION 'Unrecognized existing purpose-code check';
 END IF;
 SELECT string_agg(quote_literal(x),',') INTO code_list
 FROM (SELECT DISTINCT x FROM unnest(existing||
   ARRAY['assessment_reviewer','assessment_publisher']) x) codes;
 EXECUTE 'ALTER TABLE education_v30.database_role_organization_bindings '||
   'DROP CONSTRAINT database_role_organization_bindings_purpose_code_check';
 EXECUTE 'ALTER TABLE education_v30.database_role_organization_bindings '||
   'ADD CONSTRAINT database_role_organization_bindings_purpose_code_check '||
   'CHECK(purpose_code IN ('||code_list||'))';
END $policy$;

-- One reviewer or publisher role only. Role is an organization-bound NOLOGIN
-- principal selected by the already-authenticated application. It is NOT
-- sufficient to substitute an arbitrary client Person ID.
CREATE OR REPLACE FUNCTION education_v30.v301_assess_approval_authority(
 p_org uuid,p_actor uuid,p_purpose text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $authority$
DECLARE r text;
BEGIN
 IF p_purpose NOT IN ('assessment_reviewer','assessment_publisher') THEN
   RAISE EXCEPTION 'Unsupported assessment approval purpose' USING ERRCODE='42501';
 END IF;
 r:='can_v30_'||CASE WHEN p_purpose='assessment_reviewer'
   THEN 'assess_reviewer_' ELSE 'assess_publisher_' END||
   replace(p_org::text,'-','');
 IF current_setting('role',true) IS DISTINCT FROM r OR
    NOT education_v30.v28_role_can_access_org(p_org,p_purpose) THEN
   RAISE EXCEPTION 'Current organization-bound assessment approval role required'
     USING ERRCODE='42501';
 END IF;
 IF p_actor IS NULL OR NOT EXISTS (
   SELECT 1 FROM canonical_account_grants g
   JOIN canonical_accounts a ON a.id=g.account_id
   JOIN organizations o ON o.id=g.organization_id
   WHERE g.person_id=p_actor AND g.organization_id=p_org
   AND g.active AND g.revoked_at IS NULL
   AND g.role_code IN ('site_admin','registrar')
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND o.status='active'
 ) THEN
   RAISE EXCEPTION 'Current independently verified organization staff grant required'
     USING ERRCODE='42501';
 END IF;
END $authority$;

-- Reviewer preview includes encrypted private key bytes ONLY for the
-- individually bound reviewer SQL role. The server decrypts and projects a
-- correct-answer label after validating its own AES key; ciphertext is never
-- included in a browser response. The publisher can inspect only metadata.
CREATE OR REPLACE FUNCTION education_v30.v301_objective_assessment_snapshot(
 p_org uuid,p_actor uuid,p_version uuid,p_purpose text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $snapshot$
DECLARE doc jsonb; rec record; payload jsonb; items jsonb;
BEGIN
 PERFORM education_v30.v301_assess_approval_authority(p_org,p_actor,p_purpose);
 SELECT v.id AS version_id,v.lifecycle,d.title,d.assessment_key,
   f.id AS form_version_id,f.lifecycle AS form_lifecycle,
   f.passing_fraction,v.blueprint
 INTO rec FROM assessment_versions v
 JOIN assessment_definitions d ON d.id=v.assessment_id
 JOIN assessment_form_versions f ON f.assessment_version_id=v.id
 JOIN courses c ON c.id=d.course_id
 WHERE v.id=p_version AND d.owner_organization_id=p_org
  AND c.publisher_organization_id=p_org AND d.status='active'
  AND v.blueprint->>'source'='course-activities'
  AND v.lifecycle IN ('draft','published') AND f.version_no=1
 LIMIT 1;
 IF rec.version_id IS NULL THEN
  RAISE EXCEPTION 'Publisher-owned objective assessment not found'
    USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',iv.id,'prompt',iv.item_prompt->>'text','lifecycle',iv.lifecycle,
   'authorPersonId',item.created_by_person_id,
   'options',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',opt.id,
     'text',opt.display_content->>'text') ORDER BY opt.ordinal),'[]'::jsonb)
     FROM assessment_item_options opt WHERE opt.item_version_id=iv.id),
   'sealedKey',CASE WHEN p_purpose='assessment_reviewer'
     THEN (SELECT encode(keyrow.encrypted_key,'base64')
       FROM assessment_item_secure_keys keyrow
       WHERE keyrow.item_version_id=iv.id)
     ELSE NULL END
 ) ORDER BY fi.position),'[]'::jsonb) INTO items
 FROM assessment_form_items fi
 JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
 JOIN assessment_items item ON item.id=iv.item_id
 WHERE fi.form_version_id=rec.form_version_id;
 SELECT jsonb_build_object(
   'assessmentVersionId',rec.version_id,'formVersionId',rec.form_version_id,
   'title',rec.title,'assessmentKey',rec.assessment_key,
   'lifecycle',rec.lifecycle,'formLifecycle',rec.form_lifecycle,
   'passingFraction',rec.passing_fraction,
   'items',items,
   'reviews',jsonb_build_object(
     'assessment',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'kind',review_kind,'decision',decision,
       'reviewerPersonId',reviewer_person_id,'order',decision_order)
       ORDER BY decision_order) FROM assessment_version_review_decisions
       WHERE assessment_version_id=rec.version_id),'[]'::jsonb),
     'form',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'kind',review_kind,'decision',decision,
       'reviewerPersonId',reviewer_person_id,'order',decision_order)
       ORDER BY decision_order) FROM assessment_form_review_decisions
       WHERE form_version_id=rec.form_version_id),'[]'::jsonb),
     'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'itemVersionId',rr.item_version_id,'kind',rr.review_kind,
       'decision',rr.decision,'reviewerPersonId',rr.reviewer_person_id,
       'order',rr.decision_order) ORDER BY rr.decision_order)
       FROM assessment_item_review_decisions rr
       JOIN assessment_form_items fi ON fi.item_version_id=rr.item_version_id
       WHERE fi.form_version_id=rec.form_version_id),'[]'::jsonb)
   )
 ) INTO payload;
 RETURN payload;
END $snapshot$;

CREATE OR REPLACE FUNCTION education_v30.v301_record_objective_assessment_review(
 p_org uuid,p_actor uuid,p_version uuid,p_target text,
 p_item_version uuid,p_kind text,p_decision text,p_rationale text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $review$
DECLARE owner_id uuid; form_id uuid; saved uuid; author_id uuid;
  required_kind text[]; author_count integer; item_count integer;
BEGIN
 PERFORM education_v30.v301_assess_approval_authority(p_org,p_actor,'assessment_reviewer');
 IF p_target NOT IN ('item','assessment','form') OR
   p_decision NOT IN ('approved','rejected') OR
   p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 20 AND 1500 THEN
   RAISE EXCEPTION 'Invalid independent review request' USING ERRCODE='22023';
 END IF;
 IF (p_target='item') IS DISTINCT FROM (p_item_version IS NOT NULL) THEN
   RAISE EXCEPTION 'Exact item target required only for item reviews' USING ERRCODE='22023';
 END IF;
 required_kind:=CASE WHEN p_target='assessment'
   THEN ARRAY['academic','rights','accessibility','independent']
   ELSE ARRAY['academic','rights','accessibility'] END;
 IF p_kind IS NULL OR NOT (p_kind=ANY(required_kind)) THEN
   RAISE EXCEPTION 'Invalid review kind for target' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_version::text,0));
 SELECT d.owner_organization_id,f.id INTO owner_id,form_id
 FROM assessment_versions v JOIN assessment_definitions d ON d.id=v.assessment_id
 JOIN courses c ON c.id=d.course_id
 JOIN assessment_form_versions f ON f.assessment_version_id=v.id
 WHERE v.id=p_version AND v.lifecycle='draft' AND f.lifecycle='draft'
   AND v.blueprint->>'source'='course-activities' AND f.version_no=1
   AND d.owner_organization_id=p_org AND c.publisher_organization_id=p_org
   AND d.status='active' LIMIT 1;
 IF owner_id IS NULL THEN
   RAISE EXCEPTION 'A current publisher-owned draft is required'
     USING ERRCODE='42501';
 END IF;
 SELECT count(*),count(*) FILTER (WHERE item.created_by_person_id=p_actor)
 INTO item_count,author_count
 FROM assessment_form_items fi
 JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
 JOIN assessment_items item ON item.id=iv.item_id
 WHERE fi.form_version_id=form_id AND iv.lifecycle='draft';
 IF item_count<1 OR item_count>10 OR author_count>0 THEN
   RAISE EXCEPTION 'Author cannot independently approve their own draft'
     USING ERRCODE='42501';
 END IF;
 IF p_target='item' AND NOT EXISTS(
   SELECT 1 FROM assessment_form_items fi
   JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
   WHERE fi.form_version_id=form_id AND iv.id=p_item_version
     AND iv.lifecycle='draft') THEN
   RAISE EXCEPTION 'Question is outside this draft or already published'
     USING ERRCODE='42501';
 END IF;
 IF p_target='item' THEN
   INSERT INTO assessment_item_review_decisions(
     item_version_id,reviewer_person_id,review_kind,decision,notes)
   VALUES(p_item_version,p_actor,p_kind,p_decision,
     jsonb_build_object('rationale',btrim(p_rationale)))
   RETURNING id INTO saved;
 ELSIF p_target='form' THEN
   INSERT INTO assessment_form_review_decisions(
     form_version_id,reviewer_person_id,review_kind,decision)
   VALUES(form_id,p_actor,p_kind,p_decision) RETURNING id INTO saved;
 ELSE
   INSERT INTO assessment_version_review_decisions(
     assessment_version_id,reviewer_person_id,review_kind,decision,notes)
   VALUES(p_version,p_actor,p_kind,p_decision,
     jsonb_build_object('rationale',btrim(p_rationale)))
   RETURNING id INTO saved;
 END IF;
 INSERT INTO audit_events(actor_person_id,owning_organization_id,
   event_code,entity_kind,entity_id,payload)
 VALUES(p_actor,p_org,'assessment.review.recorded','assessment_version',
   p_version,jsonb_build_object('target',p_target,'itemVersionId',p_item_version,
     'kind',p_kind,'decision',p_decision,'reviewId',saved,'rationale',p_rationale));
 INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,
   actor_person_id,payload)
 VALUES('AssessmentReviewRecorded','assessment_version',p_version,p_actor,
   jsonb_build_object('target',p_target,'kind',p_kind,
     'decision',p_decision,'reviewId',saved));
 RETURN saved;
END $review$;

-- This release is deliberately atomic. Canonical publication triggers retain
-- final authority; release of the item(s), assessment version and form must
-- all satisfy their own latest independent review decisions.
CREATE OR REPLACE FUNCTION education_v30.v301_publish_objective_assessment(
 p_org uuid,p_actor uuid,p_version uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $publish$
DECLARE rec record; fi record; k text; recent record; author_id uuid;
  n integer:=0;
BEGIN
 PERFORM education_v30.v301_assess_approval_authority(p_org,p_actor,'assessment_publisher');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_version::text,0));
 SELECT v.id AS version_id,f.id AS form_id INTO rec
 FROM assessment_versions v
 JOIN assessment_definitions d ON d.id=v.assessment_id
 JOIN courses c ON c.id=d.course_id
 JOIN assessment_form_versions f ON f.assessment_version_id=v.id
 WHERE v.id=p_version AND v.lifecycle='draft' AND f.lifecycle='draft'
 AND d.owner_organization_id=p_org AND c.publisher_organization_id=p_org
 AND d.status='active' AND f.version_no=1
 AND v.blueprint->>'source'='course-activities' LIMIT 1;
 IF rec.version_id IS NULL THEN
   RAISE EXCEPTION 'Only a current publisher-owned draft can be published'
     USING ERRCODE='42501';
 END IF;
 FOR fi IN SELECT iv.id AS item_version_id,item.created_by_person_id
  FROM assessment_form_items fitem
  JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
  JOIN assessment_items item ON item.id=iv.item_id
  WHERE fitem.form_version_id=rec.form_id ORDER BY fitem.position LOOP
   n:=n+1;
   IF n>10 THEN RAISE EXCEPTION 'Oversized draft item set'; END IF;
   IF fi.created_by_person_id IS NULL THEN
     RAISE EXCEPTION 'Objective assessment requires known original authors';
   END IF;
   FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility']) LOOP
     SELECT reviewer_person_id,decision INTO recent
     FROM assessment_item_review_decisions
     WHERE item_version_id=fi.item_version_id AND review_kind=k
     ORDER BY decision_order DESC LIMIT 1;
     IF recent.decision IS DISTINCT FROM 'approved' OR
       recent.reviewer_person_id=fi.created_by_person_id THEN
       RAISE EXCEPTION 'Missing independent latest item approval: %',k;
     END IF;
     recent:=NULL;
   END LOOP;
 END LOOP;
 IF n<1 THEN RAISE EXCEPTION 'Empty objective assessment cannot publish'; END IF;
 FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility','independent']) LOOP
   SELECT reviewer_person_id,decision INTO recent
   FROM assessment_version_review_decisions
   WHERE assessment_version_id=p_version AND review_kind=k
   ORDER BY decision_order DESC LIMIT 1;
   IF recent.decision IS DISTINCT FROM 'approved' OR EXISTS(
     SELECT 1 FROM assessment_form_items fitem
     JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
     JOIN assessment_items item ON item.id=iv.item_id
     WHERE fitem.form_version_id=rec.form_id
       AND item.created_by_person_id=recent.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Missing independent latest assessment approval: %',k;
   END IF;
   recent:=NULL;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility']) LOOP
   SELECT reviewer_person_id,decision INTO recent
   FROM assessment_form_review_decisions
   WHERE form_version_id=rec.form_id AND review_kind=k
   ORDER BY decision_order DESC LIMIT 1;
   IF recent.decision IS DISTINCT FROM 'approved' OR EXISTS(
     SELECT 1 FROM assessment_form_items fitem
     JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
     JOIN assessment_items item ON item.id=iv.item_id
     WHERE fitem.form_version_id=rec.form_id
       AND item.created_by_person_id=recent.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Missing independent latest form approval: %',k;
   END IF;
   recent:=NULL;
 END LOOP;
 -- Underlying canonical triggers assert the same gates and enforce immutable
 -- publication. A transaction rollback reverts any partially updated items.
 UPDATE assessment_item_versions SET lifecycle='published',
   published_at=clock_timestamp()
 WHERE id IN(SELECT item_version_id FROM assessment_form_items
   WHERE form_version_id=rec.form_id) AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'No draft questions published'; END IF;
 UPDATE assessment_versions SET lifecycle='published',
   published_at=clock_timestamp() WHERE id=p_version AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment version publication failed'; END IF;
 UPDATE assessment_form_versions SET lifecycle='published',
   published_at=clock_timestamp() WHERE id=rec.form_id AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment form publication failed'; END IF;
 INSERT INTO audit_events(actor_person_id,owning_organization_id,event_code,
   entity_kind,entity_id,payload)
 VALUES(p_actor,p_org,'assessment.version.published','assessment_version',
   p_version,jsonb_build_object('formVersionId',rec.form_id,'questionCount',n));
 INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,
   actor_person_id,payload)
 VALUES('AssessmentVersionPublished','assessment_version',p_version,
   p_actor,jsonb_build_object('formVersionId',rec.form_id,'questionCount',n));
 RETURN p_version;
END $publish$;

-- Stored commands are the only privilege boundary. Neither restricted role
-- receives SELECT on answer keys, review tables, versions or learner results.
REVOKE ALL ON FUNCTION education_v30.v301_assess_approval_authority(
 uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION education_v30.v301_objective_assessment_snapshot(
 uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION education_v30.v301_record_objective_assessment_review(
 uuid,uuid,uuid,text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION education_v30.v301_publish_objective_assessment(
 uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
