-- Valor V6.1: a fictional Robotics club registration in DRAFT status.
-- Enrollment remains PENDING, no guardian consent/physical clearance is forged.
-- Native activity registration service must verify evidence before activation.
DO $fixture$
DECLARE
  vsite constant uuid:='f1000000-0000-4000-8000-000000000003';
  vclub constant uuid:='fd7f0000-0000-4000-8000-000000000011';
  vjordan constant uuid:='f1000000-0000-4000-8000-000000000005';
  vseason constant uuid:=md5('valor-v61:activity:robotics:spring-2027')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vsite AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.activities a WHERE a.id=vclub AND a.site_id=vsite AND a.name='Robotics & Design Lab')
 OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=vjordan AND metadata @> '{"synthetic":true}'::jsonb)
 THEN RAISE EXCEPTION 'Valor synthetic club guard failed'; END IF;
 INSERT INTO public.activity_seasons
 (id,activity_id,name,starts_on,ends_on,registration_opens_at,registration_closes_at,capacity,status,fee_amount_cents,metadata)
 VALUES(vseason,vclub,'SIMULATED | Spring 2027 Robotics Club','2027-02-01','2027-05-28',
   NULL,NULL,16,'draft',0,
   '{"synthetic":true,"fixture":"valor-v61-extended-scenarios","consentVerified":false,"childSafetyReadiness":"blocked","notOpenForRegistration":true}'::jsonb)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.activity_registrations
 (id,activity_season_id,student_profile_id,status,eligibility_status,roster_status,
  consent_record_id,physical_document_id,financial_obligation_id,metadata)
 SELECT md5('valor-v61:club:robotics:jordan:pending')::uuid,vseason,sp.id,
  'pending','pending','not_rostered',NULL,NULL,NULL,
  '{"synthetic":true,"fixture":"valor-v61-extended-scenarios","scenario":"guardian-signup-started","consentProvided":false,"authorizationNotGranted":true}'::jsonb
 FROM public.student_profiles sp WHERE sp.person_id=vjordan
 ON CONFLICT(id) DO NOTHING;
 IF (SELECT count(*) FROM public.activity_registrations ar JOIN public.activity_seasons ss ON ss.id=ar.activity_season_id
 WHERE ar.id=md5('valor-v61:club:robotics:jordan:pending')::uuid
   AND ss.id=vseason AND ss.status='draft' AND ar.status='pending'
   AND ar.consent_record_id IS NULL AND ar.roster_status='not_rostered')<>1
 THEN RAISE EXCEPTION 'Synthetic club preregistration invalid'; END IF;
END $fixture$;
