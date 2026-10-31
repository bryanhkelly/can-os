-- Synthetic-only CAN High School Core pack / ValorSchool acceptance fixture.
-- This seed must be executed solely against a disposable Neon branch after migration 0026 (including the resource and interop tables).
-- SET can.seed_authorized = 'valorschool' in the SAME SESSION before execution.
BEGIN;
DO $block$
BEGIN
 IF current_setting('can.seed_authorized',true) IS DISTINCT FROM 'valorschool'
 THEN RAISE EXCEPTION 'Explicit valorschool fixture authorization required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id='f1000000-0000-4000-8000-000000000002' AND slug='can-synthetic-demo' AND metadata->>'synthetic'='true')
 OR NOT EXISTS(SELECT 1 FROM programs WHERE id='f1000000-0000-4000-8000-000000000004' AND organization_id='f1000000-0000-4000-8000-000000000002' AND slug='synthetic-hybrid')
 THEN RAISE EXCEPTION 'Wrong synthetic organization or program'; END IF;
 IF NOT EXISTS(SELECT 1 FROM access_accounts WHERE email_normalized='alex.registrar@can-os.invalid')
 OR NOT EXISTS(SELECT 1 FROM access_accounts WHERE email_normalized='jordan.student@can-os.invalid')
 OR NOT EXISTS(SELECT 1 FROM access_accounts WHERE email_normalized='riley.teacher@can-os.invalid')
 THEN RAISE EXCEPTION 'Existing ValorSchool identities missing'; END IF;
END $block$;
WITH catalog(code,title,subject) AS (VALUES
('CAN-ENG9','English 9','English'),
('CAN-ENG10','English 10','English'),
('CAN-ENG11','English 11','English'),
('CAN-ENG12','English 12','English'),
('CAN-ALG1','Algebra I','Mathematics'),
('CAN-GEO','Geometry','Mathematics'),
('CAN-ALG2','Algebra II','Mathematics'),
('CAN-PRECALC','Precalculus','Mathematics'),
('CAN-STATS','Statistics','Mathematics'),
('CAN-BIO','Biology','Science'),
('CAN-CHEM','Chemistry','Science'),
('CAN-PHYS','Physics','Science'),
('CAN-ENV','Environmental Science','Science'),
('CAN-WORLD','World History','History'),
('CAN-USHIST','U.S. History','History'),
('CAN-GOV','Government','History'),
('CAN-ECON','Economics','History'),
('CAN-SPAN1','Spanish I','World Languages'),
('CAN-SPAN2','Spanish II','World Languages'),
('CAN-SPAN3','Spanish III','World Languages'),
('CAN-ART','Visual Arts','Arts'),
('CAN-DIGMEDIA','Digital Media','Arts'),
('CAN-HEALTH','Health','Health'),
('CAN-PE1','Physical Education I','Health'),
('CAN-PE2','Physical Education II','Health'),
('CAN-CS','Computer Science','Technology'),
('CAN-AI','AI and Digital Literacy','Technology'),
('CAN-FIN','Personal Finance','Electives'),
('CAN-ENTRE','Entrepreneurship','Electives'),
('CAN-PSYCH','Psychology','Electives'),
('CAN-BIBLE','Biblical Studies','Christian Studies'),
('CAN-LEAD','Christian Leadership','Christian Studies')
)
INSERT INTO course_templates(id,owning_organization_id,code,title,subject,description,metadata)
SELECT md5('can-core-course:'||code)::uuid,'f1000000-0000-4000-8000-000000000002',code,title,subject,
 'CAN original synthetic high school catalog preview',
 '{"synthetic":true,"demo":true,"notForCredit":true}'::jsonb
FROM catalog ON CONFLICT (id) DO NOTHING;

WITH catalog(code,curriculum) AS (VALUES
('CAN-ENG9','{"learning":{"version":1,"syllabus":"CAN High School Core English 9. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"claims","title":"Defensible Literary Claims","body":"An interpretive claim should be specific enough to test against a text. Read a public-domain story, identify a meaningful choice made by a character, and defend an interpretation using passages.","resources":[]},{"id":"evidence","title":"Quotation and Analysis","body":"Introduce quotations with context, cite them accurately, and explain how particular words support a claim. Differentiate plot summary from analysis.","resources":[]},{"id":"paragraphs","title":"Analytical Paragraphs","body":"Develop a topic sentence, add relevant evidence, explain its significance, and connect it to the thesis. Exchange peer feedback and revise.","resources":[]},{"id":"revision","title":"Revision Workshop","body":"Review reasoning and evidence before editing sentence mechanics. Explain in a short reflection how feedback changed your draft.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ENG10','{"learning":{"version":1,"syllabus":"CAN High School Core English 10. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting English 10","body":"This short preview introduces English 10. Identify three questions in English, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in English 10. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ENG11','{"learning":{"version":1,"syllabus":"CAN High School Core English 11. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting English 11","body":"This short preview introduces English 11. Identify three questions in English, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in English 11. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ENG12','{"learning":{"version":1,"syllabus":"CAN High School Core English 12. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting English 12","body":"This short preview introduces English 12. Identify three questions in English, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in English 12. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ALG1','{"learning":{"version":1,"syllabus":"CAN High School Core Algebra I. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"variables","title":"Variables and Equations","body":"To solve 3x + 2 = 14, subtract two and divide by three: x = 4. Check the solution by substitution. Now solve 4x - 7 = 17, show each step, and explain why both sides remain equal.","resources":[]},{"id":"linear","title":"Linear Relationships","body":"A linear function has constant rate of change. For y = 2x + 1, find the slope and intercept. Build a table for x = 0, 1 and 2, graph the points, and interpret the values in a real situation.","resources":[]},{"id":"systems","title":"Systems of Equations","body":"Solve x + y = 10 and x - y = 2. Adding gives 2x = 12, so x = 6 and y = 4. Check both equations, then construct a real-life example requiring the same constraints.","resources":[]},{"id":"model","title":"Mathematical Modeling Project","body":"Choose a fixed-cost and variable-cost situation, define your variables, construct an equation, graph it, and reflect on the model''s limitations.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-GEO','{"learning":{"version":1,"syllabus":"CAN High School Core Geometry. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Geometry","body":"This short preview introduces Geometry. Identify three questions in Mathematics, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Geometry. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ALG2','{"learning":{"version":1,"syllabus":"CAN High School Core Algebra II. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Algebra II","body":"This short preview introduces Algebra II. Identify three questions in Mathematics, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Algebra II. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-PRECALC','{"learning":{"version":1,"syllabus":"CAN High School Core Precalculus. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Precalculus","body":"This short preview introduces Precalculus. Identify three questions in Mathematics, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Precalculus. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-STATS','{"learning":{"version":1,"syllabus":"CAN High School Core Statistics. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Statistics","body":"This short preview introduces Statistics. Identify three questions in Mathematics, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Statistics. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-BIO','{"learning":{"version":1,"syllabus":"CAN High School Core Biology. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"cell-structures","title":"Cell Structures and Function","body":"Cells are fundamental functional units of living organisms. Compare the membranes, ribosomes, nuclei and mitochondria of eukaryotic cells. Draw an annotated cell diagram explaining why the structures work together.","resources":[]},{"id":"osmosis","title":"Membrane Transport","body":"A selectively permeable membrane controls movement of water and solutes. Predict what would happen to a plant cell in salt water, and propose a test including a comparison group.","resources":[]},{"id":"photosynthesis","title":"Matter and Energy in Photosynthesis","body":"Photosynthesis captures light energy to build sugars from carbon dioxide and water, releasing oxygen. Model the inputs, outputs, and how food webs depend on this process.","resources":[]},{"id":"scientific-claim","title":"Evidence in Biological Science","body":"Write a testable claim about how light affects plant growth. Identify variables, a control, sample measurements, uncertainties, and safe experimental methods.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-CHEM','{"learning":{"version":1,"syllabus":"CAN High School Core Chemistry. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Chemistry","body":"This short preview introduces Chemistry. Identify three questions in Science, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Chemistry. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-PHYS','{"learning":{"version":1,"syllabus":"CAN High School Core Physics. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Physics","body":"This short preview introduces Physics. Identify three questions in Science, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Physics. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ENV','{"learning":{"version":1,"syllabus":"CAN High School Core Environmental Science. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Environmental Science","body":"This short preview introduces Environmental Science. Identify three questions in Science, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Environmental Science. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-WORLD','{"learning":{"version":1,"syllabus":"CAN High School Core World History. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting World History","body":"This short preview introduces World History. Identify three questions in History, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in World History. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-USHIST','{"learning":{"version":1,"syllabus":"CAN High School Core U.S. History. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"primary","title":"Primary Source Analysis","body":"A primary source is historical evidence from a time or event. Analyze its author, audience, purpose and context, and identify limits on what it can establish.","resources":[]},{"id":"constitution","title":"Constitutional Structures","body":"Examine the U.S. Constitution and identify how power is divided between institutions. Evaluate how checks and balances help or complicate governance.","resources":[]},{"id":"industry","title":"Industrialization and Communities","body":"Research how industrialization reshaped work, transport and city life. Compare two sources, noting whose perspectives are represented and absent.","resources":[]},{"id":"argument","title":"Historical Argument","body":"Form a question about change over time, collect two pieces of contextualized evidence, acknowledge another interpretation, and defend a conclusion.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-GOV','{"learning":{"version":1,"syllabus":"CAN High School Core Government. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Government","body":"This short preview introduces Government. Identify three questions in History, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Government. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ECON','{"learning":{"version":1,"syllabus":"CAN High School Core Economics. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Economics","body":"This short preview introduces Economics. Identify three questions in History, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Economics. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-SPAN1','{"learning":{"version":1,"syllabus":"CAN High School Core Spanish I. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Spanish I","body":"This short preview introduces Spanish I. Identify three questions in World Languages, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Spanish I. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-SPAN2','{"learning":{"version":1,"syllabus":"CAN High School Core Spanish II. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Spanish II","body":"This short preview introduces Spanish II. Identify three questions in World Languages, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Spanish II. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-SPAN3','{"learning":{"version":1,"syllabus":"CAN High School Core Spanish III. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Spanish III","body":"This short preview introduces Spanish III. Identify three questions in World Languages, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Spanish III. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ART','{"learning":{"version":1,"syllabus":"CAN High School Core Visual Arts. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Visual Arts","body":"This short preview introduces Visual Arts. Identify three questions in Arts, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Visual Arts. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-DIGMEDIA','{"learning":{"version":1,"syllabus":"CAN High School Core Digital Media. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Digital Media","body":"This short preview introduces Digital Media. Identify three questions in Arts, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Digital Media. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-HEALTH','{"learning":{"version":1,"syllabus":"CAN High School Core Health. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Health","body":"This short preview introduces Health. Identify three questions in Health, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Health. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-PE1','{"learning":{"version":1,"syllabus":"CAN High School Core Physical Education I. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Physical Education I","body":"This short preview introduces Physical Education I. Identify three questions in Health, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Physical Education I. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-PE2','{"learning":{"version":1,"syllabus":"CAN High School Core Physical Education II. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Physical Education II","body":"This short preview introduces Physical Education II. Identify three questions in Health, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Physical Education II. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-CS','{"learning":{"version":1,"syllabus":"CAN High School Core Computer Science. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Computer Science","body":"This short preview introduces Computer Science. Identify three questions in Technology, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Computer Science. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-AI','{"learning":{"version":1,"syllabus":"CAN High School Core AI and Digital Literacy. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting AI and Digital Literacy","body":"This short preview introduces AI and Digital Literacy. Identify three questions in Technology, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in AI and Digital Literacy. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-FIN','{"learning":{"version":1,"syllabus":"CAN High School Core Personal Finance. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Personal Finance","body":"This short preview introduces Personal Finance. Identify three questions in Electives, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Personal Finance. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-ENTRE','{"learning":{"version":1,"syllabus":"CAN High School Core Entrepreneurship. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Entrepreneurship","body":"This short preview introduces Entrepreneurship. Identify three questions in Electives, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Entrepreneurship. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-PSYCH','{"learning":{"version":1,"syllabus":"CAN High School Core Psychology. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Psychology","body":"This short preview introduces Psychology. Identify three questions in Electives, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Psychology. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-BIBLE','{"learning":{"version":1,"syllabus":"CAN High School Core Biblical Studies. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Biblical Studies","body":"This short preview introduces Biblical Studies. Identify three questions in Christian Studies, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Biblical Studies. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb),
('CAN-LEAD','{"learning":{"version":1,"syllabus":"CAN High School Core Christian Leadership. Synthetic introductory preview only, not a complete 36-week course. Requires accredited-program approval, instructional review, alignment and full assessments before use for credit.","modules":[{"id":"foundations","title":"Foundations","lessons":[{"id":"orientation","title":"Starting Christian Leadership","body":"This short preview introduces Christian Leadership. Identify three questions in Christian Studies, find a credible reference, and describe what kind of evidence would answer each question.","resources":[]},{"id":"inquiry","title":"Opening Inquiry","body":"Explore an introductory question in Christian Leadership. Form a claim, collect evidence, test a potential misconception, and reflect on what remains uncertain.","resources":[]}]}],"resources":[]},"source":{"format":"can_native","version":"1","rights":"DEMO-INTERNAL","synthetic":true,"quality":"preview"}}'::jsonb)
)
INSERT INTO course_template_versions(id,course_template_id,version,status,curriculum,published_at)
SELECT md5('can-core-version:'||code)::uuid,md5('can-core-course:'||code)::uuid,
 1,'published',curriculum,now()
FROM catalog ON CONFLICT (id) DO NOTHING;

INSERT INTO curriculum_packs(id,publisher_organization_id,slug,name,description,visibility,license_code,metadata)
VALUES('f9260000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','can-high-school-core',
 'CAN High School Core · Preview',
 '32-course high school catalog and original introductory lesson previews. Not reviewed or approved for credit.',
 'private','DEMO-INTERNAL','{"synthetic":true,"preview":true,"gradeRange":"9-12","contentReadiness":"introductory"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO curriculum_pack_versions(id,pack_id,version,status,published_at,metadata)
VALUES('f9260000-0000-4000-8000-000000000002','f9260000-0000-4000-8000-000000000001',1,'published',now(),
 '{"synthetic":true,"preview":true,"notForCredit":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
WITH items(code,position) AS (VALUES
('CAN-ENG9',0),
('CAN-ENG10',1),
('CAN-ENG11',2),
('CAN-ENG12',3),
('CAN-ALG1',4),
('CAN-GEO',5),
('CAN-ALG2',6),
('CAN-PRECALC',7),
('CAN-STATS',8),
('CAN-BIO',9),
('CAN-CHEM',10),
('CAN-PHYS',11),
('CAN-ENV',12),
('CAN-WORLD',13),
('CAN-USHIST',14),
('CAN-GOV',15),
('CAN-ECON',16),
('CAN-SPAN1',17),
('CAN-SPAN2',18),
('CAN-SPAN3',19),
('CAN-ART',20),
('CAN-DIGMEDIA',21),
('CAN-HEALTH',22),
('CAN-PE1',23),
('CAN-PE2',24),
('CAN-CS',25),
('CAN-AI',26),
('CAN-FIN',27),
('CAN-ENTRE',28),
('CAN-PSYCH',29),
('CAN-BIBLE',30),
('CAN-LEAD',31)
)
INSERT INTO curriculum_pack_items(id,pack_version_id,course_template_version_id,position,metadata)
SELECT md5('can-core-item:'||code)::uuid,'f9260000-0000-4000-8000-000000000002',
 md5('can-core-version:'||code)::uuid,position,
 '{"synthetic":true}'::jsonb
FROM items ON CONFLICT (id) DO NOTHING;

WITH registrar AS (
 SELECT DISTINCT person_grant.person_id FROM access_accounts account
 JOIN account_person_grants person_grant ON person_grant.account_id=account.id
 WHERE account.email_normalized='alex.registrar@can-os.invalid'
 AND person_grant.organization_id='f1000000-0000-4000-8000-000000000002' AND person_grant.role='registrar' LIMIT 1
)
INSERT INTO curriculum_entitlements(id,organization_id,pack_id,status,terms_accepted_at,accepted_by_person_id,metadata)
SELECT 'f9260000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002','f9260000-0000-4000-8000-000000000001',
 'active',now(),registrar.person_id,'{"synthetic":true,"licenseCode":"DEMO-INTERNAL"}'::jsonb
FROM registrar ON CONFLICT (id) DO NOTHING;
WITH registrar AS (
 SELECT DISTINCT person_grant.person_id FROM access_accounts account
 JOIN account_person_grants person_grant ON person_grant.account_id=account.id
 WHERE account.email_normalized='alex.registrar@can-os.invalid'
 AND person_grant.organization_id='f1000000-0000-4000-8000-000000000002' AND person_grant.role='registrar' LIMIT 1
)
INSERT INTO curriculum_adoptions(id,organization_id,program_id,site_id,pack_id,pack_version_id,status,adopted_by_person_id,metadata)
SELECT 'f9260000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003',
 'f9260000-0000-4000-8000-000000000001','f9260000-0000-4000-8000-000000000002','active',registrar.person_id,'{"synthetic":true}'::jsonb
FROM registrar ON CONFLICT (id) DO NOTHING;

-- Operable subset: four new sections, without changing existing classes/sections.
WITH section_courses(code) AS (VALUES ('CAN-ALG1'),('CAN-BIO'),('CAN-ENG9'),('CAN-USHIST'))
INSERT INTO sections(id,program_id,site_id,course_template_version_id,code,title,term_id,active,metadata)
SELECT md5('can-core-section:'||c.code)::uuid,'f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003',v.id,c.code,c.title,
 'f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true,"demo":true}'::jsonb
FROM section_courses c0 JOIN course_templates c ON c.code=c0.code AND c.owning_organization_id='f1000000-0000-4000-8000-000000000002'
JOIN course_template_versions v ON v.course_template_id=c.id AND v.version=1
ON CONFLICT (id) DO NOTHING;
WITH teacher AS (
 SELECT DISTINCT person_grant.person_id FROM access_accounts account
 JOIN account_person_grants person_grant ON person_grant.account_id=account.id
 WHERE account.email_normalized='riley.teacher@can-os.invalid'
 AND person_grant.organization_id='f1000000-0000-4000-8000-000000000002' AND person_grant.role='teacher' LIMIT 1
)
INSERT INTO section_teachers(id,section_id,person_id,role,assignment_source)
SELECT md5('can-core-teacher:'||section.code)::uuid,section.id,teacher.person_id,'teacher','manual'
FROM sections section CROSS JOIN teacher
WHERE section.program_id='f1000000-0000-4000-8000-000000000004' AND section.code IN ('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
ON CONFLICT (id) DO NOTHING;
WITH student AS (
 SELECT DISTINCT p.id AS student_id FROM access_accounts account
 JOIN account_person_grants person_grant ON person_grant.account_id=account.id
 JOIN student_profiles p ON p.person_id=person_grant.person_id
 WHERE account.email_normalized='jordan.student@can-os.invalid'
 AND person_grant.organization_id='f1000000-0000-4000-8000-000000000002' AND person_grant.role='student' LIMIT 1
)
INSERT INTO enrollments(id,student_profile_id,kind,status,organization_id,program_id,section_id,school_year_id,started_at,metadata)
SELECT md5('can-core-enrollment:'||section.code)::uuid,student.student_id,
 'section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004',section.id,'f1000000-0000-4000-8000-000000000009',
 now(),'{"synthetic":true,"demo":true}'::jsonb
FROM sections section CROSS JOIN student
WHERE section.program_id='f1000000-0000-4000-8000-000000000004' AND section.code IN ('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
ON CONFLICT (id) DO NOTHING;

-- Reusable external-link resource: link-only, no third-party copy or implied redistribution license.
INSERT INTO curriculum_resources(id,owner_organization_id,kind,title,url,license_code,source_url,metadata)
VALUES ('f9260000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000002','link',
 'National Archives Education','https://www.archives.gov/education',
 'EXTERNAL-LINK-ONLY','https://www.archives.gov/education',
 '{"synthetic":true,"rightsNote":"link to source only; no content imported"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO curriculum_resource_bindings(id,resource_id,pack_version_id,course_template_version_id,lesson_id,placement,metadata)
VALUES ('f9260000-0000-4000-8000-000000000006',
 'f9260000-0000-4000-8000-000000000005','f9260000-0000-4000-8000-000000000002',
 md5('can-core-version:CAN-USHIST')::uuid,'primary','extension',
 '{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
-- Synthetic teacher-created instructional activity for the four sample sections.
WITH assignment(code,title,instructions) AS (VALUES
 ('CAN-ALG1','Model a Linear Relationship','Choose an everyday cost scenario. Define variables, write and graph a linear equation, and explain the slope and intercept.'),
 ('CAN-BIO','Cell Structure Evidence Diagram','Draw an annotated cell showing membrane, nucleus, mitochondria and ribosomes. Explain how the structures work together.'),
 ('CAN-ENG9','Literary Evidence Paragraph','Write an analytical paragraph with a claim, quotation and interpretation of evidence from a public-domain short story.'),
 ('CAN-USHIST','Primary Source Context Analysis','Analyze a public archival U.S. history source by author, purpose, audience, context and evidentiary limitations.')
)
INSERT INTO assessments(id,section_id,title,instructions,status,points_possible,available_at,due_at,metadata,created_by_person_id)
SELECT md5('can-core-assessment:'||assignment.code)::uuid,s.id,assignment.title,assignment.instructions,
 'published',20,'2026-10-19T08:00:00Z'::timestamptz,'2026-11-06T23:59:00Z'::timestamptz,
 '{"synthetic":true,"preview":true,"notForCredit":true}'::jsonb,teacher.person_id
FROM assignment
JOIN sections s ON s.code=assignment.code AND s.metadata->>'synthetic'='true'
JOIN programs p ON p.id=s.program_id AND p.slug='synthetic-hybrid'
JOIN organizations o ON o.id=p.organization_id AND o.slug='can-synthetic-demo' AND o.metadata->>'synthetic'='true'
JOIN section_teachers teacher ON teacher.section_id=s.id
JOIN access_accounts account ON account.email_normalized='riley.teacher@can-os.invalid'
JOIN account_person_grants person_grant ON person_grant.account_id=account.id AND person_grant.person_id=teacher.person_id AND person_grant.role='teacher' AND person_grant.active=true
ON CONFLICT(id) DO NOTHING;

-- Two different synthetic grading states for student and teacher workflows.
WITH work(code,response,status,score,feedback) AS (VALUES
 ('CAN-ALG1','{"text":"Let x be meals produced; y=4x+12 models fixed and variable cost. The slope is 4 dollars per meal and the intercept is 12 dollars.","synthetic":true}'::jsonb,'submitted',NULL::numeric,'{}'::jsonb),
 ('CAN-ENG9','{"text":"The character''s decision reveals loyalty under pressure. A quotation provides evidence, followed by a textual interpretation.","synthetic":true}'::jsonb,'graded',17::numeric,'{"comment":"Strong claim and analysis; improve quotation context.","synthetic":true}'::jsonb))
INSERT INTO submissions(id,assessment_id,student_profile_id,status,timeliness,attempt_number,submitted_at,graded_at,score,grader_person_id,response,feedback)
SELECT md5('can-core-submission:'||work.code)::uuid,a.id,e.student_profile_id,
 work.status::submission_status,'on_time',1,'2026-10-20T17:00:00Z'::timestamptz,
 CASE WHEN work.status='graded' THEN '2026-10-21T10:00:00Z'::timestamptz ELSE NULL END,
 work.score,CASE WHEN work.status='graded' THEN st.person_id ELSE NULL END,
 work.response,work.feedback
FROM work
JOIN sections s ON s.code=work.code AND s.metadata->>'synthetic'='true'
JOIN assessments a ON a.section_id=s.id AND a.metadata->>'synthetic'='true'
JOIN enrollments e ON e.section_id=s.id AND e.kind='section' AND e.status='active' AND e.metadata->>'synthetic'='true'
JOIN section_teachers st ON st.section_id=s.id
ON CONFLICT(id) DO NOTHING;

-- Lesson progress references the published immutable course version rather than free-standing demo content.
INSERT INTO lesson_progress(section_id,student_profile_id,course_template_version_id,lesson_id,completed_at)
SELECT s.id,e.student_profile_id,s.course_template_version_id,
 v.curriculum->'learning'->'modules'->0->'lessons'->0->>'id',
 CASE WHEN s.code IN('CAN-ALG1','CAN-ENG9') THEN '2026-10-19T18:00:00Z'::timestamptz ELSE NULL END
FROM sections s
JOIN enrollments e ON e.section_id=s.id AND e.kind='section' AND e.status='active' AND e.metadata->>'synthetic'='true'
JOIN course_template_versions v ON v.id=s.course_template_version_id
WHERE s.code IN('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST') AND s.metadata->>'synthetic'='true'
AND jsonb_array_length(v.curriculum->'learning'->'modules'->0->'lessons')>0
ON CONFLICT(student_profile_id,section_id,course_template_version_id,lesson_id) DO NOTHING;

COMMIT;
