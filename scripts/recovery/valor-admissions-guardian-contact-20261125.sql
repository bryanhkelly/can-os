-- Repair only the three known synthetic Valor fixture applications.
-- Do not infer guardian contacts for real or unidentified applications.
BEGIN;
UPDATE public.applications a
SET metadata=jsonb_set(a.metadata,'{contactPersonId}',to_jsonb(a.submitted_by_person_id::text)),
    updated_at=now()
FROM public.student_profiles s, public.guardian_relationships g
WHERE (a.id,a.idempotency_key) IN (
 ('fd7f0000-0000-4000-8000-000000000041'::uuid,'valor-depth-app-1'),
 ('fd7f0000-0000-4000-8000-000000000042'::uuid,'valor-depth-app-2'),
 ('fd7f0000-0000-4000-8000-000000000043'::uuid,'valor-depth-app-3')
)
AND a.metadata='{}'::jsonb
AND s.id=a.student_profile_id
AND g.student_person_id=s.person_id
AND g.guardian_person_id=a.submitted_by_person_id
AND g.metadata->>'verification'='verified'
AND g.can_manage_enrollment
RETURNING a.id;
COMMIT;
