-- Valor V6.1: synthetic feedback invitations in draft, unsent state.
-- No false privacy/safeguarding/accessibility approvals, no real guardian
-- permission evidence, no responses inserted into a nonactive campaign.
DO $fixture$
DECLARE
  vsite constant uuid:='f1000000-0000-4000-8000-000000000003';
  jordan constant uuid:='f1000000-0000-4000-8000-000000000005';
  morgan constant uuid:='f3000000-0000-4000-8000-000000000007';
  vc_student constant uuid:=md5('valor-v61:survey-campaign:student-feedback')::uuid;
  vc_family constant uuid:=md5('valor-v61:survey-campaign:family-feedback')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vsite AND metadata @> '{"synthetic":true}'::jsonb)
 OR (SELECT count(*) FROM public.people WHERE id IN(jordan,morgan)
   AND metadata @> '{"synthetic":true}'::jsonb)<>2
 OR NOT EXISTS(SELECT 1 FROM public.guardian_relationships gr
   WHERE gr.guardian_person_id=morgan AND gr.student_person_id=jordan AND gr.can_view_academics)
 OR (SELECT count(*) FROM public.survey_campaigns sc WHERE sc.id IN(vc_student,vc_family)
  AND sc.site_id=vsite AND sc.status='draft' AND sc.survey_permission_evidence_id IS NULL)<>2
 THEN RAISE EXCEPTION 'Student and guardian synthetic draft survey guards failed'; END IF;
 INSERT INTO public.survey_invitations(id,campaign_id,invited_person_id,
  invite_key,delivery_channel,sent_at,due_at,reminder_count)
 VALUES
 (md5('valor-v61:survey-preview:jordan')::uuid,vc_student,jordan,
  md5('valor-v61:survey-preview:jordan:key')::uuid,'in_app',NULL,NULL,0),
 (md5('valor-v61:survey-preview:morgan')::uuid,vc_family,morgan,
  md5('valor-v61:survey-preview:morgan:key')::uuid,'in_app',NULL,NULL,0)
 ON CONFLICT(id) DO NOTHING;
 IF (SELECT count(*) FROM public.survey_invitations WHERE id IN(
    md5('valor-v61:survey-preview:jordan')::uuid,
    md5('valor-v61:survey-preview:morgan')::uuid)
  AND sent_at IS NULL)<>2
 OR EXISTS(SELECT 1 FROM public.survey_responses WHERE invitation_id IN(
    md5('valor-v61:survey-preview:jordan')::uuid,
    md5('valor-v61:survey-preview:morgan')::uuid))
 THEN RAISE EXCEPTION 'Unsent, unapproved survey preview invariant failed'; END IF;
END $fixture$;
