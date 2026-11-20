-- Assign the two pre-existing SITE-scoped study groups a canonical Class
-- reference in metadata. Does not create a legacy Section/Cohort dependency.
DO $valor_groups_bridge$
DECLARE site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=site AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.classes WHERE id=md5('valor-v61:class:ALG-S')::uuid AND site_id=site)
 OR NOT EXISTS(SELECT 1 FROM public.classes WHERE id=md5('valor-v61:class:CAN-ENG9')::uuid AND site_id=site)
 THEN RAISE EXCEPTION 'Canonical Valor fixture scope changed'; END IF;
 UPDATE public.study_groups SET metadata=metadata||jsonb_build_object(
   'synthetic',true,'canonicalClassId',
   CASE id WHEN 'f2600000-0000-4000-8000-000000000001'::uuid
     THEN md5('valor-v61:class:ALG-S')::text
     ELSE md5('valor-v61:class:CAN-ENG9')::text END,
   'fixtureBridge','valor-v61-existing-group-class-links'),
   section_id=NULL,updated_at=now()
 WHERE site_id=site AND id IN('f2600000-0000-4000-8000-000000000001'::uuid,
                             'f2600000-0000-4000-8000-000000000002'::uuid)
 AND metadata @> '{"synthetic":true}'::jsonb;
 IF (SELECT COUNT(*) FROM public.study_groups
     WHERE site_id=site AND metadata ? 'canonicalClassId')<>7
 OR EXISTS(SELECT 1 FROM public.study_groups WHERE site_id=site AND section_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Expected seven canonical metadata groups, zero legacy references'; END IF;
END $valor_groups_bridge$;
