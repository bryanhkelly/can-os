-- Read-only V6.1 test fixture assertion. Scoped to synthetic Valor/Barton
-- and the existing canonical Program catalog, never school authorization.
WITH target AS (
  SELECT s.id,s.name,s.lifecycle_status,s.metadata,g.code AS geographic_code
  FROM public.sites s
  LEFT JOIN public.geographic_areas g ON g.id=s.geographic_area_id
  WHERE s.id IN (
    'f1000000-0000-4000-8000-000000000003'::uuid,
    'd8082b23-b28c-454d-a144-6860ef19d9ea'::uuid
  )
), authority AS (
  SELECT target.id,
    EXISTS(SELECT 1 FROM public.programs p
      JOIN public.school_configuration_versions cfg
        ON cfg.program_id=p.id AND cfg.status='approved'
          AND cfg.approved_by_person_id IS NOT NULL
          AND cfg.approved_at IS NOT NULL
      JOIN public.program_site_authorizations auth
        ON auth.program_id=p.id AND auth.site_id=target.id
          AND auth.status='approved'
          AND auth.reviewed_by_person_id IS NOT NULL
          AND auth.evidence_document_id IS NOT NULL
          AND auth.effective_from<=clock_timestamp()
          AND (auth.effective_through IS NULL OR auth.effective_through>clock_timestamp())
      WHERE p.site_id=target.id
    ) AS has_academic_candidate
  FROM target
)
SELECT target.name,
  target.lifecycle_status,
  target.geographic_code,
  target.metadata->'geographicClassification'->>'reviewStatus' as qa_geography_status,
  authority.has_academic_candidate,
  (SELECT count(*)::int FROM public.blueprint_reference_items items
    JOIN public.blueprint_reference_item_versions versions
      ON versions.item_id=items.id
    WHERE items.reference_kind='program_model'
      AND items.status='active' AND versions.lifecycle='published'
      AND items.code IN (
        'can.program.after_school','can.program.summer_enrichment',
        'can.program.saturday_academy','can.program.ai_digital_skills',
        'can.program.custom_training'
      )) AS non_school_published_versions,
  (SELECT count(DISTINCT b.id)::int FROM public.blueprints b
    JOIN public.blueprint_versions v ON v.blueprint_id=b.id
    WHERE v.lifecycle='published'
      AND b.code IN (
        'can.pilot.ai-digital-skills.four-session',
        'can.pilot.custom-training.one-hour'
      )) AS published_pilot_solution_models
FROM target JOIN authority ON authority.id=target.id
ORDER BY target.name;
