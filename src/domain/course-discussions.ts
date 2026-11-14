export type DiscussionMessage={id:string;authorLabel:string;body:string;createdAt:string;parentMessageId:string|null};
export function discussionTree<T extends DiscussionMessage>(messages:T[]){
 const ids=new Set(messages.map(m=>m.id));
 const ordered=[...messages].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 return ordered.map(m=>({...m,parentMessageId:m.parentMessageId&&ids.has(m.parentMessageId)&&m.parentMessageId!==m.id?m.parentMessageId:null}));
}
export function isValidDiscussionPost(body:string){return body.trim().length>=1&&body.trim().length<=5000;}
export type DiscussionSettings={locked:boolean;graded:boolean;requiresInitialPostBeforeReplies:boolean};
export const defaultDiscussionSettings:DiscussionSettings={locked:false,graded:false,requiresInitialPostBeforeReplies:false};

/** Keep a deep-linked thread inside its authorized Section and optional lesson. */
export function selectTeacherDiscussionThreads<T extends {id:string;sectionId:string;curriculumLessonId:string|null}>(
 threads:readonly T[],selection:{section?:string;lesson?:string;thread?:string},
):T[]{
 return threads.filter(item=>(!selection.section||item.sectionId===selection.section)&&
  (!selection.thread||item.id===selection.thread)&&
  (!selection.lesson||item.curriculumLessonId===selection.lesson||item.curriculumLessonId===null));
}
