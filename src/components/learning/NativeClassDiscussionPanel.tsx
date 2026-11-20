import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeClassDiscussions, submitNativeClassDiscussionMessage,
} from "@/modules/classes/native-class-discussions.functions";

/** Class-scoped, direct-student-only private conversation with the assigned
 * synthetic instructor. Does not turn messages into a public minor chat room. */
export function NativeClassDiscussionPanel({classEnrollmentId}:{classEnrollmentId:string}){
  const client=useQueryClient();
  const query=useQuery({
    queryKey:["native-class-private-discussions",classEnrollmentId],
    queryFn:()=>getNativeClassDiscussions({data:{classEnrollmentId}}),
    retry:false,
  });
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function send(threadId:string){
    const body=(drafts[threadId]??"").trim();
    if(busy||body.length<5)return;
    setBusy(threadId);setError("");setNotice("");
    try{
      await submitNativeClassDiscussionMessage({
        data:{classEnrollmentId,threadId,body},
      });
      setDrafts(previous=>({...previous,[threadId]:""}));
      setNotice("Your private Class message was saved.");
      await client.invalidateQueries({
        queryKey:["native-class-private-discussions",classEnrollmentId],
      });
    }catch(failure){
      setError(normalizeClientError(failure,"Unable to save your Class message.").message);
    }finally{setBusy(null);}
  }
  return <section className="space-y-5 border border-border bg-card p-5" aria-label="Class discussions">
    <div>
      <h2 className="font-serif text-2xl">Class discussions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Private demonstration conversations with your instructor.
        Messages stay within this CAN OS test account and are not sent by email or SMS.
      </p>
    </div>
    {query.isPending&&<p role="status">Opening your private Class conversations…</p>}
    {query.isError&&<div role="alert" className="space-y-3 text-sm">
      <p>Discussions are unavailable under your current enrollment.</p>
      <Button type="button" variant="outline" onClick={()=>void query.refetch()}>Retry</Button>
    </div>}
    {query.data?.threads.length===0&&<p className="text-sm">
      No private instructor discussions have been opened for this Class.
    </p>}
    {query.data?.threads.map(thread=><article key={thread.id} className="space-y-4 border-t border-border pt-4">
      <h3 className="font-semibold">{thread.subject}</h3>
      <ol className="space-y-3" aria-label={"Messages in "+thread.subject}>
        {thread.messages.map(message=><li key={message.id} className="border border-border bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {message.senderLabel} · {new Date(message.sentAt).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-line text-sm">{message.body}</p>
        </li>)}
      </ol>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Reply privately</span>
        <Textarea rows={4} maxLength={1500}
          placeholder="Ask your teacher a Class question…"
          value={drafts[thread.id]??""}
          disabled={!!busy}
          onChange={event=>setDrafts(previous=>({...previous,[thread.id]:event.target.value}))}/>
      </label>
      <Button type="button" disabled={!!busy||(drafts[thread.id]??"").trim().length<5}
        onClick={()=>void send(thread.id)}>
        {busy===thread.id?"Saving…":"Send private reply"}
      </Button>
    </article>)}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
