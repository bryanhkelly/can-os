import { z } from "zod";

/**
 * Published once per canonical Course version and reused by every Class
 * operating that Course. These are low-stakes knowledge checks and optional
 * identified feedback, NOT academic grading or a credential policy.
 */
const key=z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const quizPromptSchema=z.object({
  key,prompt:z.string().trim().min(5).max(500),
  choices:z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  correctIndex:z.number().int().min(0).max(5),
}).strict().refine(q=>q.correctIndex<q.choices.length,{message:"Correct answer must be one of the listed choices"});
export const feedbackPromptSchema=z.object({
  key,prompt:z.string().trim().min(5).max(500),
  kind:z.enum(["rating","text"]),
}).strict();
export const courseActivityPublicationSchema=z.object({
  courseVersionId:z.string().uuid(),
  title:z.string().trim().min(3).max(160),
  quizQuestions:z.array(quizPromptSchema).min(1).max(10),
  feedbackQuestions:z.array(feedbackPromptSchema).max(10),
  passingFraction:z.number().min(0.1).max(1),
  requireAllLessons:z.boolean(),
  feedbackRequired:z.boolean(),
  feedbackConsentVersion:z.string().trim().min(3).max(60),
  feedbackConsentText:z.string().trim().min(25).max(2000),
}).strict().superRefine((value,ctx)=>{
  for(const [name,items] of [["quizQuestions",value.quizQuestions],
                              ["feedbackQuestions",value.feedbackQuestions]] as const){
    if(new Set(items.map(item=>item.key)).size!==items.length)
      ctx.addIssue({code:"custom",path:[name],message:"Question keys must be unique"});
  }
  if(value.feedbackRequired&&value.feedbackQuestions.length===0)
    ctx.addIssue({code:"custom",path:["feedbackQuestions"],message:"Required feedback needs at least one question"});
});
export type QuizPrompt=z.infer<typeof quizPromptSchema>;
export type FeedbackPrompt=z.infer<typeof feedbackPromptSchema>;
export type CourseActivityPublication=z.infer<typeof courseActivityPublicationSchema>;

export const quizSubmissionSchema=z.array(z.object({
  key,choiceIndex:z.number().int().min(0).max(5),
}).strict()).min(1).max(10);
export const feedbackSubmissionSchema=z.array(z.object({
  key,
  rating:z.number().int().min(1).max(5).nullable(),
  text:z.string().trim().max(1000).nullable(),
}).strict()).max(10);
export type QuizSubmission=z.infer<typeof quizSubmissionSchema>;
export type FeedbackSubmission=z.infer<typeof feedbackSubmissionSchema>;

function hasExactQuestionKeys(expected:readonly {key:string}[],actual:readonly {key:string}[]){
  if(actual.length!==expected.length)return false;
  const actualKeys=new Set(actual.map(a=>a.key));
  return actualKeys.size===actual.length && expected.every(q=>actualKeys.has(q.key));
}
export function scoreNativeClassQuiz(questions:readonly QuizPrompt[],answers:QuizSubmission){
  if(!hasExactQuestionKeys(questions,answers))
    throw new Error("Answer every published knowledge-check question exactly once.");
  const chosen=new Map(answers.map(a=>[a.key,a.choiceIndex]));
  for(const item of questions){
    if((chosen.get(item.key)??-1)<0 || (chosen.get(item.key)??-1)>=item.choices.length)
      throw new Error("One or more selected answers are not valid for this version.");
  }
  const earned=questions.filter(q=>chosen.get(q.key)===q.correctIndex).length;
  return {earned,total:questions.length,fraction:earned/questions.length};
}
export function validateNativeClassFeedback(questions:readonly FeedbackPrompt[],answers:FeedbackSubmission){
  if(!hasExactQuestionKeys(questions,answers))
    throw new Error("Answer each feedback question exactly once.");
  const byKey=new Map(answers.map(a=>[a.key,a]));
  for(const question of questions){
    const answer=byKey.get(question.key)!;
    if(question.kind==="rating" && (answer.rating===null||answer.text!==null))
      throw new Error("A rating question requires a rating from 1 to 5.");
    if(question.kind==="text" && (answer.rating!==null||!answer.text))
      throw new Error("A written-feedback question requires a nonempty response.");
  }
  return answers;
}
export function publicNativeQuizQuestions(questions:readonly QuizPrompt[]){
  return questions.map(({key,prompt,choices})=>({key,prompt,choices}));
}
export function nativeClassCompletionReadiness(input:{
  quizPassed:boolean;feedbackSubmitted:boolean;feedbackRequired:boolean;
  requireAllLessons:boolean;completedLessons:number;totalLessons:number;
}){
  const lessonsMet=!input.requireAllLessons||
    (input.totalLessons>0&&input.completedLessons===input.totalLessons);
  return {
    eligible:input.quizPassed&&(!input.feedbackRequired||input.feedbackSubmitted)&&lessonsMet,
    quizPassed:input.quizPassed,
    feedbackMet:!input.feedbackRequired||input.feedbackSubmitted,
    lessonsMet,
    completedLessons:input.completedLessons,
    totalLessons:input.totalLessons,
  };
}
