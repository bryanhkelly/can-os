-- Disposable synthetic fixture only. Requires student-s1-s4.sql and migration 0022.
-- Publish a distinct immutable course version; never rewrite a published curriculum.
INSERT INTO course_template_versions(id,course_template_id,version,status,curriculum,published_at)
SELECT 'f1220000-0000-4000-8000-000000000001',id,22,'published',
'{"learning":{"version":1,"syllabus":"Synthetic English Literature: read closely, explain your evidence, and revise thoughtfully.","modules":[{"id":"reading","title":"Close reading","lessons":[{"id":"evidence","title":"Reading with evidence","body":"Read the assigned passage. Identify its central claim and explain which details support your interpretation.","resources":[{"id":"library","title":"Library of Congress reading resources","url":"https://www.loc.gov/"}]},{"id":"revision","title":"Revising a claim","body":"Review your claim and replace general statements with specific textual evidence.","resources":[]}]}],"resources":[]}}'::jsonb,now()
FROM course_templates WHERE id='f1000000-0000-4000-8000-000000000020' AND metadata->>'synthetic'='true'
ON CONFLICT(id) DO NOTHING;

UPDATE sections SET course_template_version_id='f1220000-0000-4000-8000-000000000001',updated_at=now()
WHERE id='f1000000-0000-4000-8000-000000000040' AND metadata->>'synthetic'='true'
AND EXISTS(SELECT 1 FROM course_template_versions WHERE id='f1220000-0000-4000-8000-000000000001');
