/**
 * Survey answers are evaluated against published, version-pinned questions.
 * Question content is data, never COGIC-specific code. No survey answer
 * counts as an academic assessment or verified participation time.
 */
export type SurveyChoice = { id: string };
export type SurveyQuestion = {
  id: string;
  type: "single_choice" | "multiple_choice" | "rating" | "likert" | "nps" | "text" | "matrix";
  required: boolean;
  options: readonly SurveyChoice[];
  min: number | null;
  max: number | null;
};
export type SurveyAnswerInput = {
  questionId: string;
  text?: string;
  number?: number;
  optionIds?: string[];
};
export type ValidatedSurveyAnswer = {
  questionId: string;
  text: string | null;
  number: number | null;
  optionIds: string[];
};
export class SurveyValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SurveyValidationError"; }
}
/** Fail closed for unsupported branching/matrix surveys; do not miscollect responses. */
export function validateCourseSurveyAnswers(
  questions: readonly SurveyQuestion[],
  input: readonly SurveyAnswerInput[],
): ValidatedSurveyAnswer[] {
  if (questions.length > 100 || input.length > 100) throw new SurveyValidationError("Too many survey questions");
  const keys = new Set<string>();
  const definitions = new Map(questions.map(q => [q.id, q]));
  if (definitions.size !== questions.length) throw new SurveyValidationError("Duplicate survey question");
  for (const answer of input) {
    if (keys.has(answer.questionId)) throw new SurveyValidationError("Duplicate response");
    keys.add(answer.questionId);
    if (!definitions.has(answer.questionId)) throw new SurveyValidationError("Unknown question");
  }
  const byId = new Map(input.map(a => [a.questionId, a]));
  const results: ValidatedSurveyAnswer[] = [];
  for (const question of questions) {
    if (question.type === "matrix") throw new SurveyValidationError("Matrix surveys require dedicated answer support");
    const answer = byId.get(question.id);
    if (!answer) {
      if (question.required) throw new SurveyValidationError("A required question was skipped");
      continue;
    }
    const options = answer.optionIds ?? [];
    if (!Array.isArray(options) || options.some(id => typeof id !== "string") ||
        new Set(options).size !== options.length ||
        options.some(id => !question.options.some(o => o.id === id)))
      throw new SurveyValidationError("Invalid answer option");
    const hasText = answer.text !== undefined;
    const hasNumber = answer.number !== undefined;
    if ((hasText ? 1 : 0) + (hasNumber ? 1 : 0) + (options.length ? 1 : 0) !== 1) {
      throw new SurveyValidationError("Choose one answer format per question");
    }
    if (question.type === "single_choice" || question.type === "multiple_choice") {
      if (hasText || hasNumber || !options.length || (question.type === "single_choice" && options.length !== 1))
        throw new SurveyValidationError("Choice response required");
    } else if (question.type === "rating" || question.type === "likert" || question.type === "nps") {
      if (hasText || options.length || typeof answer.number !== "number" ||
          !Number.isSafeInteger(answer.number) || question.min === null || question.max === null ||
          answer.number < question.min || answer.number > question.max)
        throw new SurveyValidationError("Rating out of range");
    } else if (question.type === "text") {
      if (hasNumber || options.length || typeof answer.text !== "string" ||
          !answer.text.trim() || answer.text.length > 4000)
        throw new SurveyValidationError("Invalid text response");
    }
    results.push({ questionId: question.id,
      text: hasText ? answer.text!.trim() : null,
      number: hasNumber ? answer.number! : null,
      optionIds: [...options],
    });
  }
  return results;
}
