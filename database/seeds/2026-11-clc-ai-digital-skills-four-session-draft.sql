-- CAN OS: complete one four-session AI and Digital Skills pilot Course draft.
-- Database: primary main only, no bridges, no production approval.
-- These are draft lessons, NOT Class Sessions, enrollment or permission to teach.
-- Course version ca270000-0000-4000-8000-000000000042 (draft).
-- Run in one transaction; lock the Course version against concurrent publication.
-- Do not alter an already published immutable curriculum version.
DO $
BEGIN
  PERFORM 1 FROM education_v30.course_versions
  WHERE id='ca270000-0000-4000-8000-000000000042'
    AND course_id='ca270000-0000-4000-8000-000000000041'
    AND lifecycle='draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected unpublished AI and Digital Skills Course version';
  END IF;
END $;

INSERT INTO education_v30.course_units
(id,course_version_id,unit_key,title,sequence_no,content) VALUES
('ca270000-0000-4000-8000-000000000045','ca270000-0000-4000-8000-000000000042','applied-digital-skills','Apply digital skills safely',2,'{"synthetic":true,"instruction":"Recorded teacher plus facilitated practice","requiresIndependentReview":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_lessons
(id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
VALUES
('ca270000-0000-4000-8000-000000000046','ca270000-0000-4000-8000-000000000042','ca270000-0000-4000-8000-000000000043','verify-before-you-trust','Session 2: Verify Before You Trust',2,'{"synthetic":true,"estimatedMinutes":45,"objectives":["Distinguish a claim from supporting evidence","Cross-check an AI answer against two credible sources","Identify fabricated citations and misleading confidence"],"segments":[{"title":"Warm-up: spot the claim","minutes":5},{"title":"Evidence and source quality","minutes":10},{"title":"Compare two independent sources","minutes":15},{"title":"Evaluate fabricated citations","minutes":10},{"title":"Exit reflection","minutes":5}],"mediaStatus":"not_uploaded","assessmentStatus":"not_published","requiresIndependentReview":true}'::jsonb),
('ca270000-0000-4000-8000-000000000047','ca270000-0000-4000-8000-000000000042','ca270000-0000-4000-8000-000000000045','protect-your-digital-identity','Session 3: Protect Your Digital Identity',3,'{"synthetic":true,"estimatedMinutes":45,"objectives":["Identify sensitive information that should not be entered into AI tools","Recognize phishing and impersonation patterns","Choose safer privacy settings and reporting steps"],"segments":[{"title":"Privacy warm-up","minutes":5},{"title":"What not to share","minutes":10},{"title":"Phishing and impersonation practice","minutes":15},{"title":"Personal safety and reporting plan","minutes":10},{"title":"Exit reflection","minutes":5}],"mediaStatus":"not_uploaded","assessmentStatus":"not_published","requiresIndependentReview":true}'::jsonb),
('ca270000-0000-4000-8000-000000000048','ca270000-0000-4000-8000-000000000042','ca270000-0000-4000-8000-000000000045','responsible-ai-project','Session 4: Responsible AI Project',4,'{"synthetic":true,"estimatedMinutes":50,"objectives":["Define a practical problem and audience","Use AI with independent judgment and source verification","Present privacy protections and limitations to peers"],"segments":[{"title":"Choose a community or school problem","minutes":5},{"title":"Draft and test a prompt","minutes":15},{"title":"Verify and revise the result","minutes":15},{"title":"Peer presentation and feedback","minutes":10},{"title":"Final reflection","minutes":5}],"mediaStatus":"not_uploaded","assessmentStatus":"not_published","requiresIndependentReview":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
