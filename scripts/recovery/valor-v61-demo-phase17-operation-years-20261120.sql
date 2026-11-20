-- Valor canonical operation academic years, aligned with the two existing
-- Site academic calendars. Planning only: no operating authorization issued.
DO $fixture$
DECLARE
  vsite constant uuid:='f1000000-0000-4000-8000-000000000003';
  vop constant uuid:=md5('valor-v61:operation')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vsite AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.education_operation_sites WHERE operation_id=vop AND site_id=vsite)
 OR (SELECT count(*) FROM public.academic_calendars ac JOIN public.school_years sy ON sy.id=ac.school_year_id
    WHERE ac.site_id=vsite AND sy.starts_on BETWEEN '2026-08-01' AND '2027-09-01')<>2
 THEN RAISE EXCEPTION 'Valor planning calendar reconciliation failed'; END IF;
 INSERT INTO public.operation_academic_years
 (id,operation_id,academic_year_key,starts_on,ends_on,status)
 SELECT md5('valor-v61:operation-year:'||sy.key)::uuid,vop,sy.key,sy.starts_on,sy.ends_on,'planning'
 FROM public.academic_calendars ac JOIN public.school_years sy ON sy.id=ac.school_year_id
 WHERE ac.site_id=vsite
 ON CONFLICT(id) DO NOTHING;
 IF (SELECT count(*) FROM public.operation_academic_years
  WHERE operation_id=vop AND status='planning')<>2
 THEN RAISE EXCEPTION 'Expected two planning academic years'; END IF;
END $fixture$;
