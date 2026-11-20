import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceNotice } from "@/components/workspace";
import { releaseClassroomActivity } from "@/modules/learning/classroom-evidence.functions";

/** Safe to render on a public single-laptop display. This component never
 * fetches roster, individual answers, aggregate results or moderator notes.
 * These controls remain server-authorized to the active facilitator.
 */
export function ClassroomPublicPromptControls({facilitatedSessionId}:{
  facilitatedSessionId:string;
}){
  const [prompt,setPrompt]=useState("");
  const [kind,setKind]=useState<"single_choice"|"text">("single_choice");
  const [choices,setChoices]=useState("Yes\nNo");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const options=kind==="single_choice"?choices.split("\n").map(x=>x.trim()).filter(Boolean):[];
  const valid=prompt.trim().length>=5&&prompt.trim().length<=1000&&
    (kind==="text"||(options.length>=2&&options.length<=8&&options.every(x=>x.length<=200)));
  async function release(){
    if(!valid||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await releaseClassroomActivity({data:{
        facilitatedSessionId,requestId:crypto.randomUUID(),
        lessonId:null,prompt:prompt.trim(),answerType:kind,choices:options,
      }});
      setNotice("Question released. Participants answer privately on their devices.");
      setPrompt("");
    }catch{
      setError("Question could not be released. Check current room and facilitator rights.");
    }finally{setBusy(false)}
  }
  return <section className="border border-border bg-card p-4"
    aria-label="Public-safe single-laptop classroom questions">
    <h2 className="text-base font-semibold">Ask the room</h2>
    <p className="mt-2 text-xs text-muted-foreground">
      Public presentation controls only. Responses, identities and results are
      available exclusively in the private facilitator console.
    </p>
    <Field label="Question" className="mt-3"><Textarea id="public-question" rows={2} maxLength={1000}
      className="mt-1"
      value={prompt} onChange={event=>setPrompt(event.target.value)}/></Field>
    <Field label="Answer format" className="mt-3"><Select id="public-answer-kind" value={kind}
      onChange={event=>setKind(event.target.value as typeof kind)}
      className="mt-1">
      <option value="single_choice">Multiple choice</option>
      <option value="text">Short written response</option>
    </Select></Field>
    {kind==="single_choice"&&<>
      <Field label="Choices, one per line" className="mt-3"><Textarea id="public-answer-options" rows={3} maxLength={1607}
        className="mt-1"
        value={choices} onChange={event=>setChoices(event.target.value)}/></Field>
    </>}
    <Button className="mt-3" size="sm" disabled={!valid||busy}
      onClick={()=>void release()}>
      {busy?"Releasing…":"Release question"}
    </Button>
    {notice&&<WorkspaceNotice tone="info" className="mt-2">{notice}</WorkspaceNotice>}
    {error&&<WorkspaceNotice tone="danger" className="mt-2">{error}</WorkspaceNotice>}
  </section>;
}
