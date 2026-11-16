import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativePublicClassCatalogPage, getMyNativeClassEnrollments, enrollInNativeClass,
} from "@/modules/classes/native-class-enrollment.functions";

export const Route=createFileRoute("/learn/classes")({
  validateSearch:(value:Record<string,unknown>):{search?:string;classId?:string}=>({
    search:typeof value.search==="string"&&value.search.trim().length<=100
      ?value.search.trim():undefined,
    classId:typeof value.classId==="string"&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.classId)
      ?value.classId:undefined,
  }),
  component:NativeLearnerClasses,
});
type Item=Awaited<ReturnType<typeof getNativePublicClassCatalogPage>>["items"][number];
type CreditMode="for_credit"|"audit"|"not_applicable";
const creditName:Record<CreditMode,string>={
  for_credit:"For credit (eligibility required)",
  audit:"Audit, no academic credit",not_applicable:"No academic credit",
};

function OfferingCard({item,onJoined}:{item:Item;onJoined:()=>Promise<void>}){
  const [mode,setMode]=useState<CreditMode>((item.allowedCreditModes[0]??"not_applicable") as CreditMode);
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const self=item.enrollmentMethods.includes("self");
  async function enroll(){
    if(!self||!adult||!consent||busy)return;
    setBusy(true);setMessage("");setError("");
    try{
      const result=await enrollInNativeClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        creditMode:mode,adultAttested:true,consentAccepted:true,
      }});
      setMessage(result.alreadyEnrolled?"You are already enrolled.":"Enrollment confirmed. Your Course Attempt is ready.");
      await onJoined();
    }catch(e){setError(normalizeClientError(e,"Class enrollment was not completed.").message)}
    finally{setBusy(false)}
  }
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {item.deliveryMode.replace("_"," ")} · {item.siteId?"Site hosted":"Online"}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.classTitle}</h3>
    {item.capacity!==null&&<p className="mt-2 text-sm text-muted-foreground">Capacity: {item.capacity} seats</p>}
    {self?<>
      <div className="mt-4">
        <label className="block text-sm font-semibold" htmlFor={"class-credit-"+item.classOfferingVersionId}>Participation</label>
        <select id={"class-credit-"+item.classOfferingVersionId} value={mode}
          onChange={e=>setMode(e.target.value as CreditMode)}
          className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
          {item.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
        </select>
      </div>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Participation and data-use terms</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.consentText}</p>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1"
        checked={adult} onChange={e=>setAdult(e.target.checked)}/>
        I confirm that I am at least 18 years old. Age is independently verified.
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1"
        checked={consent} onChange={e=>setConsent(e.target.checked)}/>
        I have read and accept these participation and data-use terms.
      </label>
      <Button className="mt-4" disabled={!adult||!consent||busy} onClick={()=>void enroll()}>
        {busy?"Enrolling…":"Enroll in Class"}
      </Button>
    </>:<p className="mt-4 text-sm text-muted-foreground">
      This Class is available by {item.enrollmentMethods.join(", ")}. Self-enrollment is not enabled.
    </p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </article>;
}
function NativeLearnerClasses(){
  const client=useQueryClient();
  const requested=Route.useSearch();
  const [searchText,setSearchText]=useState(requested.search??"");
  const [search,setSearch]=useState(requested.search??"");
  const [filteredClassId,setFilteredClassId]=useState(requested.classId??"");
  const catalog=useInfiniteQuery({
    queryKey:["native-public-class-catalog",search,filteredClassId],
    initialPageParam:null as {title:string;classId:string}|null,
    queryFn:({pageParam})=>getNativePublicClassCatalogPage({data:{
      search,cursor:pageParam,
      ...(filteredClassId?{classId:filteredClassId}:{}),
    }}),
    getNextPageParam:last=>last.nextCursor,
    retry:false,
  });
  const catalogItems=catalog.data?.pages.flatMap(page=>page.items)??[];
  const enrolled=useQuery({queryKey:["native-my-class-enrollments"],
    queryFn:()=>getMyNativeClassEnrollments(),retry:false});
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["native-public-class-catalog",search,filteredClassId]}),
      client.invalidateQueries({queryKey:["native-my-class-enrollments"]}),
    ]);
  }
  return <WorkspaceShell width="wide" eyebrow="My CAN" title="My Classes"
    subtitle="One Class enrollment and one learning record, regardless of whether your Class is academic, independent or facilitated."
    actions={<Link to="/learn/my-programs" className="text-sm font-semibold text-primary underline underline-offset-4">My Learning &amp; Programs</Link>}>
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Enrolled Classes</h2>
      {enrolled.isPending&&<p role="status" className="mt-3 text-sm">Loading your Classes…</p>}
      {enrolled.isError&&<p role="alert" className="mt-3 border border-border p-4 text-sm">Native Class records are not yet enabled for this session or environment.</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(enrolled.data??[]).map(item=><article key={item.classEnrollmentId} className="border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.status} · {item.creditMode.replace("_"," ")}</p>
          <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{item.deliveryMode.replace("_"," ")}</p>
          {item.courseAttemptId&&<Link to="/classes/$classId"
            params={{classId:item.classId}}
            search={{view:"learn",tab:"lessons"}}
            className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Open Class</Link>}
        </article>)}
      </div>
      {enrolled.isSuccess&&enrolled.data.length===0&&<p className="mt-4 text-sm text-muted-foreground">You have no native Class enrollments yet.</p>}
    </section>
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Explore Classes</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only currently published public Class Offerings are listed. Private and unlisted Classes are not shown.</p>
      <form className="mt-4 flex flex-wrap gap-2" role="search"
        onSubmit={event=>{event.preventDefault();setFilteredClassId("");setSearch(searchText.trim());}}>
        <label className="sr-only" htmlFor="native-class-catalog-search">Search Classes</label>
        <input id="native-class-catalog-search" type="search" maxLength={100}
          value={searchText} onChange={event=>setSearchText(event.target.value)}
          placeholder="Search by Class name"
          className="min-h-11 min-w-[14rem] flex-1 border border-border bg-background px-3 text-sm"/>
        <Button type="submit">Search Classes</Button>
        {(search||filteredClassId)&&<Button type="button" variant="outline"
          onClick={()=>{setFilteredClassId("");setSearch("");setSearchText("");}}>
          {filteredClassId?"Browse all public Classes":"Clear"}
        </Button>}
      </form>
      {filteredClassId&&<p role="status" className="mt-3 text-sm">
        Showing the specific publicly published Class selected from the Site website.
        Its enrollment terms and current authority are checked again here.
      </p>}
      {catalog.isPending&&<p role="status" className="mt-4 text-sm">Checking currently offered Classes…</p>}
      {catalog.isError&&<p role="alert" className="mt-4 border border-border p-4 text-sm">Public Class discovery is not enabled or is unavailable.</p>}
      {catalog.isSuccess&&catalogItems.length===0&&<p className="mt-4 text-sm text-muted-foreground">No public Class Offerings are currently accepting enrollment.</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {catalogItems.map(item=><OfferingCard key={item.classOfferingVersionId} item={item} onJoined={refresh}/>)}
      </div>
      {catalog.hasNextPage&&<Button variant="outline" className="mt-4"
        disabled={catalog.isFetchingNextPage}
        onClick={()=>void catalog.fetchNextPage()}>
        {catalog.isFetchingNextPage?"Loading Classes…":"Load more Classes"}
      </Button>}
      {catalog.isSuccess&&catalogItems.length>0&&!catalog.hasNextPage&&
        <p className="mt-3 text-xs text-muted-foreground">End of matching Classes.</p>}

    </section>
  </WorkspaceShell>;
}
