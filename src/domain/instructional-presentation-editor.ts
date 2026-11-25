import type { trackLessonPresentations } from "@/db/canonical-v301";
type Binding=Pick<typeof trackLessonPresentations.$inferSelect,"courseLessonId"|"assetVersionId"|"presentationKind"|"ordinal"|"accessibilityNotes">;
export function replacePrimaryPresentation(items:readonly Binding[],lessonId:string,assetId:string):Binding[]{
 const matching=items.filter(item=>item.courseLessonId===lessonId&&item.presentationKind==="primary");
 if(assetId&&matching.length===1&&matching[0]?.assetVersionId===assetId)return [...items];
 return [...items.filter(item=>!(item.courseLessonId===lessonId&&item.presentationKind==="primary")),
  ...(assetId?[{courseLessonId:lessonId,assetVersionId:assetId,presentationKind:"primary" as const,ordinal:1,accessibilityNotes:{}}]:[])];
}
export function addSupplementalPresentation(items:readonly Binding[],lessonId:string,assetId:string):Binding[]{
 if(!assetId||items.some(item=>item.courseLessonId===lessonId&&item.presentationKind==="supplement"&&item.assetVersionId===assetId))return [...items];
 const used=new Set(items.filter(item=>item.courseLessonId===lessonId&&item.presentationKind==="supplement").map(item=>item.ordinal));
 let ordinal=1;while(used.has(ordinal))ordinal++;
 return [...items,{courseLessonId:lessonId,assetVersionId:assetId,presentationKind:"supplement",ordinal,accessibilityNotes:{}}];
}
export function removePresentation(items:readonly Binding[],target:Binding):Binding[]{
 return items.filter(item=>!(item.courseLessonId===target.courseLessonId&&item.presentationKind===target.presentationKind&&item.ordinal===target.ordinal&&item.assetVersionId===target.assetVersionId));
}
export function unresolvedPresentationCount(items:readonly Binding[],publishedIds:ReadonlySet<string>){
 return items.filter(item=>!publishedIds.has(item.assetVersionId)).length;
}
