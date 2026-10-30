import { readClassContent } from "./class-content";

/** Only the accepted publisher release defines linkable instructional lessons.
 * Supplemental resources and assessments reference these IDs; never edit them. */
export function publisherLessonChoices(curriculum:Record<string,unknown>,status:string){
 if(status!=="published")return [] as Array<{id:string;title:string}>;
 return readClassContent(curriculum)?.modules.flatMap(module=>
  module.lessons.map(lesson=>({id:lesson.id,title:lesson.title})))??[];
}
export function assertPublisherLessonReference(
 curriculum:Record<string,unknown>,status:string,lessonId:string|undefined,
){
 if(!lessonId)return;
 if(!publisherLessonChoices(curriculum,status).some(lesson=>lesson.id===lessonId))
  throw new Error("Select a lesson in the currently published publisher curriculum.");
}
