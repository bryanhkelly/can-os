-- Synthetic teacher rehearsal, NOT an enrollment, safety approval or attendance record.
-- Run after 2026-11-community-learning-center-demo.sql.
UPDATE public.activities
SET metadata = jsonb_set(metadata, '{teacherRehearsal}', $lesson$
{
  "version": 1,
  "title": "Session 1: Ask Better Questions",
  "audience": "After-school learners, grades 6-12",
  "totalMinutes": 35,
  "mediaTitle": "AI and Digital Skills: session introduction",
  "objectives": [
    "Write a useful prompt with context and an audience",
    "Check an important AI-generated claim against a trusted source",
    "Identify information that should stay private"
  ],
  "steps": [
    {"id":"introduce","title":"Welcome and introduction","minutes":5,"teacherPrompt":"Ask: Where have you encountered AI this week? Explain that AI can assist, but may be wrong.","learnerTask":"Share one example or question."},
    {"id":"context","title":"Build a better prompt","minutes":8,"teacherPrompt":"Model a prompt specifying audience, purpose and format: Explain online privacy to a seventh grader in three bullet points.","learnerTask":"Rewrite a vague question into one specific prompt."},
    {"id":"verify","title":"Check the answer","minutes":8,"teacherPrompt":"Compare an AI claim with two trusted sources. Show that confidence is not evidence.","learnerTask":"Identify one claim that needs verification and name a source."},
    {"id":"privacy","title":"Protect personal information","minutes":7,"teacherPrompt":"Discuss what not to share: names, passwords, addresses and private records.","learnerTask":"Choose a safe way to redact identifying details."},
    {"id":"exit","title":"Exit ticket","minutes":7,"teacherPrompt":"Ask every learner to state their improved prompt, a source to verify, and a privacy rule.","learnerTask":"Share a three-part exit response."}
  ],
  "check": {
    "question":"Which is the safest and most useful way to ask an AI tool for help?",
    "choices":[
      "Paste a classmate's personal records and request a summary",
      "Provide the audience and task, leave out private data, then check important claims",
      "Assume every answer is true if it sounds confident"
    ],
    "correctIndex":1,
    "explanation":"Useful context improves the prompt, while private data stays protected and important claims need independent verification."
  }
}
$lesson$::jsonb, true),
updated_at = NOW()
WHERE id = 'ca270000-0000-4000-8000-000000000021'::uuid
  AND metadata->>'synthetic' = 'true';
