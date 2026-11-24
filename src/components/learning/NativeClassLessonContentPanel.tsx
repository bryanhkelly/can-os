import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ActionFooter, EmptyState, WorkspaceNotice } from "@/components/workspace";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { markNativeClassLessonComplete } from "@/modules/classes/native-class-learning.functions";
import { normalizeClientError } from "@/lib/client-error";

type Lesson={
  lessonId:string; lessonTitle:string; lessonBody:string;
  progressStatus:string|null; unitTitle:string;
  videoResources:Array<{url:string;title:string;reviewStatus:string}>;
};

/** Read the existing canonical Course lesson. No Section, track duplicate,
 * invented video file, or additional enrollment is created. */
export function NativeClassLessonContentPanel({classEnrollmentId,lessons,selectedLessonId}:{
  classEnrollmentId:string;
  lessons:Lesson[];
  selectedLessonId:string|null;
}){
  const client=useQueryClient();
  const [working,setWorking]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const selected=lessons.find(lesson=>lesson.lessonId===selectedLessonId)??lessons[0];
  if(!selected)return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-xl">Course lessons</h2>
    <EmptyState className="mt-3" title="No published lesson content is available yet."/>
  </section>;
  async function complete(){
    if(working||!selected)return;
    setWorking(true);setNotice("");setError("");
    try{
      const result=await markNativeClassLessonComplete({
        data:{classEnrollmentId,lessonId:selected.lessonId},
      });
      setNotice(result.alreadyCompleted
        ?"You already marked this lesson complete."
        :"Lesson milestone saved to your Course Attempt.");
      await client.invalidateQueries({queryKey:["native-unified-class-progress",classEnrollmentId]});
    }catch(failure){
      setError(normalizeClientError(failure,"Unable to save lesson progress.").message);
    }finally{setWorking(false);}
  }
  const done=selected.progressStatus==="completed"||selected.progressStatus==="waived";
  return <section className="space-y-5 border border-border bg-card p-5" aria-label="Course lesson">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {selected.unitTitle}
      </p>
      <h2 className="mt-2 font-serif text-2xl">{selected.lessonTitle}</h2>
    </div>
    <div className="whitespace-pre-line text-sm leading-7">
      {selected.lessonBody||"This lesson is awaiting instructional content."}
    </div>
    {selected.videoResources.length>0&&<section className="space-y-2 border-t border-border pt-4">
      <h3 className="font-semibold">Supplemental videos</h3>
      <p className="text-xs text-muted-foreground">
        These original lesson references are supplemental, not a reviewed recorded-instructor presentation.
        Their availability and accessibility must be confirmed by the school.
      </p>
      <div className="space-y-4">
        {selected.videoResources.map(video=>
          <ClassVideoPlayer key={video.url} title={video.title}
            url={video.url} declaredVideo presentation="classroom"/>
        )}
      </div>
    </section>}
    <div className="border-t border-border pt-4">
      <ActionFooter layout="inline" className="mt-0"><Button type="button" variant={done?"outline":"default"}
        disabled={working||done} loading={working} loadingLabel="Saving…" onClick={()=>void complete()}>
        {done?"Lesson completed":"Mark lesson complete"}
      </Button></ActionFooter>
      <p className="mt-2 text-xs text-muted-foreground">
        This records an individual learning milestone, not a grade, attendance or academic credit.
      </p>
    </div>
    {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  </section>;
}
