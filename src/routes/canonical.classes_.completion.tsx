import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";

/** /canonical is the design staging area. The Class completion interface
 * is now promoted into /class/:classId. This route forwards old bookmarks,
 * never creates reviewer rights or a parallel completion workflow. */
export const Route=createFileRoute("/canonical/classes_/completion")({
  validateSearch:(search:Record<string,unknown>)=>{
    const classId=z.string().uuid().safeParse(search.classId);
    return {classId:classId.success?classId.data:undefined};
  },
  component:StagedClassCompletionLocation,
});
function StagedClassCompletionLocation(){
  const {classId}=Route.useSearch();
  if(!classId)return <Navigate to="/class" search={{view:"manage"}} replace/>;
  return <Navigate to="/class/$classId" params={{classId}}
    search={{view:"manage",tab:"completion"}} replace/>;
}
