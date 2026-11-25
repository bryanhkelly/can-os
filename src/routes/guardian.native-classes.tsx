import {createFileRoute,Link} from "@tanstack/react-router";
import {useInfiniteQuery,useQuery,useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {WorkspaceShell} from "@/components/workspace";
import {Button} from "@/components/ui/button";
import {HistoricalClassWork} from "@/components/learning/HistoricalClassWork";
import {getGuardianNativeHistoricalWork} from "@/modules/classes/guardian-historical-class-work.functions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/choice";
import {normalizeClientError} from "@/lib/client-error";
import {getNativePublicClassCatalogPage} from "@/modules/classes/native-class-enrollment.functions";
import {
 getMyNativeGuardianLearners,requestNativeGuardianClassApproval,
 getMyNativeGuardianClassApprovals,acceptNativeGuardianClassApproval,
 getMyNativeGuardianClassEnrollments,withdrawMyGuardianNativeClassEnrollment,
} from "@/modules/classes/native-class-guardian-enrollment.functions";

export const Route=createFileRoute("/guardian/native-classes")({
 component:GuardianNativeClasses,
});

function GuardianNativeClasses(){
 const client=useQueryClient();
 const [searchText,setSearchText]=useState("");
 const [search,setSearch]=useState("");
 const [learner,setLearner]=useState("");
 const [target,setTarget]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const children=useQuery({
  queryKey:["guardian-native-class-learners"],
  queryFn:()=>getMyNativeGuardianLearners(),retry:false,
 });
 const catalog=useInfiniteQuery({
  queryKey:["guardian-native-class-catalog",search],
  initialPageParam:null as {title:string;classId:string}|null,
  queryFn:({pageParam})=>getNativePublicClassCatalogPage({
   data:{search,cursor:pageParam},
  }),
  getNextPageParam:last=>last.nextCursor,retry:false,
 });
 const approvals=useQuery({
  queryKey:["guardian-native-class-approvals"],
  queryFn:()=>getMyNativeGuardianClassApprovals(),retry:false,
 });
 const history=useQuery({
  queryKey:["guardian-native-class-enrollments"],
  queryFn:()=>getMyNativeGuardianClassEnrollments(),retry:false,
 });
 const eligible=(catalog.data?.pages.flatMap(page=>page.items)??[]).filter(row=>
  row.enrollmentMethods.includes("approval")&&row.remainingSeats!==0);
 async function refresh(){
  await Promise.all([
   client.invalidateQueries({queryKey:["guardian-native-class-approvals"]}),
   client.invalidateQueries({queryKey:["guardian-native-class-enrollments"]}),
   client.invalidateQueries({queryKey:["guardian-native-class-catalog"]}),
   client.invalidateQueries({queryKey:["my-activity"]}),
  ]);
 }
 async function requestApproval(){
  if(!learner||!target||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   await requestNativeGuardianClassApproval({data:{
    learnerPersonId:learner,classOfferingVersionId:target,
    requestId:crypto.randomUUID(),
   }});
   setTarget("");
   setNotice("Application submitted for independent staff review. No seat is reserved.");
   await refresh();
  }catch(e){setError(normalizeClientError(e,"Unable to request Class approval.").message)}
  finally{setBusy(false)}
 }
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Family" title="Classes for my family"
  subtitle="Apply for verified learners with one guardian account. A Class approval is separate from parental consent and enrollment."
  actions={<Link to="/home" className="text-sm font-semibold underline">Family dashboard</Link>}>
  <section className="mt-6 border border-border bg-card p-5">
   <h2 className="font-serif text-xl">Request a Class place</h2>
   <p className="mt-2 text-sm text-muted-foreground">
    Only learners with independently verified, current guardian authority are shown.
    Available Classes must publish an approval-required enrollment pathway.
   </p>
   {children.isError&&<p role="alert" className="mt-3 text-sm">
    Guardian identity and learner relationship could not be verified.
   </p>}
   {children.isSuccess&&children.data.length===0&&<p className="mt-3 text-sm">
    No verified learners are linked to this guardian's canonical Person.
    Contact your registrar to complete the identity and relationship review.
   </p>}
   <form className="mt-4 flex gap-2" role="search"
    onSubmit={e=>{e.preventDefault();setSearch(searchText.trim());}}>
    <Label className="sr-only" htmlFor="guardian-native-class-search">Search Classes</Label>
    <Input id="guardian-native-class-search" type="search" maxLength={100}
     value={searchText} onChange={e=>setSearchText(e.target.value)}
     placeholder="Search available Classes"
     className="min-h-11 flex-1 border border-border bg-background px-3 text-sm"/>
    <Button type="submit">Search</Button>
   </form>
   <div className="mt-4 grid gap-4 md:grid-cols-2">
    <Label className="text-sm font-semibold">Learner
     <Select value={learner} onChange={e=>setLearner(e.target.value)}
      className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
      <option value="">Choose verified learner</option>
      {children.data?.map(row=><option key={row.learnerPersonId}
       value={row.learnerPersonId}>{row.name}</option>)}
     </Select>
    </Label>
    <Label className="text-sm font-semibold">Class
     <Select value={target} onChange={e=>setTarget(e.target.value)}
      className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
      <option value="">Choose published Class</option>
      {eligible.map(row=><option key={row.classOfferingVersionId}
       value={row.classOfferingVersionId}>{row.classTitle}</option>)}
     </Select>
    </Label>
   </div>
   {catalog.hasNextPage&&<Button className="mt-3" variant="outline"
    disabled={catalog.isFetchingNextPage} onClick={()=>void catalog.fetchNextPage()}>
    {catalog.isFetchingNextPage?"Loading…":"Load more Classes"}
   </Button>}
   <Button className="mt-4" disabled={!learner||!target||busy}
    onClick={()=>void requestApproval()}>{busy?"Submitting…":"Request Class approval"}</Button>
   {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
   {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>
  <section className="mt-6">
   <h2 className="font-serif text-xl">Applications and consent</h2>
   {approvals.isError&&<p role="alert" className="mt-3 text-sm">
    Guardian Class applications could not be loaded.
   </p>}
   <div className="mt-3 grid gap-4 lg:grid-cols-2">
    {approvals.data?.map(item=><GuardianClassApprovalCard key={item.approvalRequestId}
     item={item} onChanged={refresh}/>)}
   </div>
  </section>
  <section className="mt-6">
   <h2 className="font-serif text-xl">Family Class participation</h2>
   {history.isError&&<p role="alert" className="mt-3 text-sm">
    Guardian Class history could not be verified.
   </p>}
   <div className="mt-3 grid gap-4 lg:grid-cols-2">
    {history.data?.map(item=><GuardianClassHistoryCard key={item.classEnrollmentId}
     item={item} onChanged={refresh}/>)}
   </div>
  </section>
 </WorkspaceShell>;
}

type GuardianApproval=Awaited<ReturnType<typeof getMyNativeGuardianClassApprovals>>[number];
function GuardianClassApprovalCard({item,onChanged}:{
 item:GuardianApproval;onChanged:()=>Promise<void>;
}){
 const [credit,setCredit]=useState<"audit"|"not_applicable">("not_applicable");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const eligible=item.state==="approved"&&!item.acceptedEnrollmentId;
 async function accept(){
  if(!eligible||!consent||busy||!item.allowedCreditModes.includes(credit))return;
  setBusy(true);setMessage("");setError("");
  try{
   await acceptNativeGuardianClassApproval({data:{
    approvalRequestId:item.approvalRequestId,creditMode:credit,consentAccepted:true,
   }});
   setMessage("Class place accepted. Your learner's Class history is now active.");
   await onChanged();
  }catch(e){setError(normalizeClientError(e,"Could not complete guardian Class enrollment.").message)}
  finally{setBusy(false)}
 }
 return <article className="border border-border bg-card p-5">
  <h3 className="font-serif text-lg">{item.classTitle}</h3>
  <p className="mt-2 text-sm">Review: {item.state}</p>
  <p className="mt-2 text-sm text-muted-foreground">
   {item.acceptedEnrollmentId?"Enrollment completed.":eligible?
    "Approved, but not yet enrolled. A place is not reserved.":"Independent review or closure applies."}
  </p>
  {eligible&&<>
   <Label className="mt-3 block text-sm font-semibold">Participation
    <Select value={credit} onChange={e=>setCredit(e.target.value as typeof credit)}
     className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
     {item.allowedCreditModes.map(mode=><option key={mode} value={mode}>{mode}</option>)}
    </Select>
   </Label>
   <p className="mt-3 whitespace-pre-wrap border border-border bg-muted/20 p-3 text-sm">
    {item.consentText}
   </p>
   <Label className="mt-3 flex items-start gap-2 text-sm">
    <Checkbox checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    I am this learner's verified guardian and accept these current Class participation terms.
   </Label>
   <Button className="mt-4" disabled={!consent||busy||
     !item.allowedCreditModes.includes(credit)}
    onClick={()=>void accept()}>{busy?"Processing…":"Accept approved place"}</Button>
  </>}
  {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
 </article>;
}

type GuardianHistory=Awaited<ReturnType<typeof getMyNativeGuardianClassEnrollments>>[number];
function GuardianClassHistoryCard({item,onChanged}:{
 item:GuardianHistory;onChanged:()=>Promise<void>;
}){
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function withdraw(){
  if(!confirm||busy)return;
  setBusy(true);setMessage("");setError("");
  try{
   await withdrawMyGuardianNativeClassEnrollment({data:{classEnrollmentId:item.classEnrollmentId}});
   setMessage("Class participation withdrawn; historical evidence is preserved.");
   setConfirm(false);await onChanged();
  }catch(e){setError(normalizeClientError(e,"Could not withdraw learner.").message)}
  finally{setBusy(false)}
 }
 return <article className="border border-border bg-card p-5">
  <h3 className="font-serif text-lg">{item.title}</h3>
  <p className="mt-2 text-sm">Status: {item.status}</p>
  {item.status==="active"&&<>
   <HistoricalClassWork key={item.classEnrollmentId} queryScope={["guardian-historical-class-work",item.classEnrollmentId]}
    loadPage={beforeId=>getGuardianNativeHistoricalWork({data:{classEnrollmentId:item.classEnrollmentId,beforeId}})}/>
   {!confirm?<Button variant="outline" className="mt-3"
    onClick={()=>setConfirm(true)}>Withdraw learner</Button>:
   <div className="mt-3 border border-border p-3">
    <p className="text-sm">This ends active participation but preserves progress, attendance and outcomes.</p>
    <div className="mt-3 flex gap-2">
     <Button disabled={busy} onClick={()=>void withdraw()}>Confirm withdrawal</Button>
     <Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Keep place</Button>
    </div>
   </div>}
  </>}
  {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
 </article>;
}
