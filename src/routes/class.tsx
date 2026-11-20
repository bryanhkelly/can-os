import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { WorkspaceShell, MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { NativeClassHomeNavigation } from "@/components/learning/NativeClassHomeNavigation";
import { OfferingCard } from "@/components/learning/native-class/OfferingCard";
import { ApprovedClassCard } from "@/components/learning/native-class/ApprovedClassCard";
import { InvitationCard } from "@/components/learning/native-class/InvitationCard";
import { EnrolledClassCard } from "@/components/learning/native-class/EnrolledClassCard";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getNativePublicClassCatalogPage, getMyNativeClassEnrollmentHistoryPage,
} from "@/modules/classes/native-class-enrollment.functions";
import { getMyNativeClassInvitations } from "@/modules/classes/native-class-invitations.functions";
import { getMyNativeClassApprovals } from "@/modules/classes/native-class-approvals.functions";
import { resumeLinkedNativeClassLearner } from "@/modules/classes/native-class-session-recovery.functions";

/** Load privileged Class management composition only when requested,
 * keeping the public Class directory and enrollment entry lightweight. */
const NativeClassManager=lazy(async()=>{
  const module=await import("@/components/learning/NativeClassManager");
  return {default:module.NativeClassManager};
});
/** Publisher Course activity authoring is available through the same /class
 * entry, without pulling its sensitive editing UI into public discovery. */
const PublisherCourseActivityEditor=lazy(async()=>{
  const module=await import("@/components/learning/PublisherCourseActivityEditor");
  return {default:module.PublisherCourseActivityEditor};
});
/** Recorded-instructor production belongs to authorized Course presenters;
 * both views share the existing private authoring and independent review services. */
const ProviderInstructionHome=lazy(async()=>{
  const module=await import("@/components/learning/ProviderInstructionHome");
  return {default:module.ProviderInstructionHome};
});
const ProviderInstructionDraft=lazy(async()=>{
  const module=await import("@/components/learning/ProviderInstructionDraft");
  return {default:module.ProviderInstructionDraft};
});
const ProviderInstructionReviews=lazy(async()=>{
  const module=await import("@/components/learning/ProviderInstructionReviews");
  return {default:module.ProviderInstructionReviews};
});

const classUuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function selectedClassUuid(value:unknown):string|undefined{
  return typeof value==="string"&&classUuidPattern.test(value)?value:undefined;
}

export const Route=createFileRoute("/class")({
  validateSearch:(value:Record<string,unknown>):{search?:string;classId?:string;siteId?:string;offeringVersionId?:string;courseVersionId?:string;trackVersionId?:string;view?:"manage"|"activities"|"content"|"reviews"}=>({
    view:value.view==="manage"||value.view==="activities"||value.view==="content"||value.view==="reviews"?value.view:undefined,
    search:typeof value.search==="string"&&value.search.trim().length<=100
      ?value.search.trim():undefined,
    classId:selectedClassUuid(value.classId),
    siteId:selectedClassUuid(value.siteId),
    offeringVersionId:selectedClassUuid(value.offeringVersionId),
    courseVersionId:selectedClassUuid(value.courseVersionId),
    trackVersionId:selectedClassUuid(value.trackVersionId),
  }),
  component:ClassHome,
});
/** One canonical Class entry. Staff creation and learner discovery share
 * the same route, without a second Class management implementation.
 * All commands remain independently scoped and authorized server-side. */
function ClassHome(){
  const selected=Route.useSearch();
  const mode=selected.view==="manage"?"manage":
    selected.view==="activities"?"activities":selected.view==="content"?"content":selected.view==="reviews"?"reviews":"explore";
  const navigation=<NativeClassHomeNavigation mode={mode}
    search={selected.search} classId={selected.classId}
    siteId={selected.siteId} offeringVersionId={selected.offeringVersionId}/>;
  if(selected.view==="reviews")return <Suspense fallback={<WorkspaceShell
    title="Independent content review" eyebrow="CAN OS" width="wide">
    <p role="status">Opening independent reviewer workspace…</p>
  </WorkspaceShell>}>
    <ProviderInstructionReviews navigation={navigation}/>
  </Suspense>;
  if(selected.view==="content")return <Suspense fallback={<WorkspaceShell
    title="Recorded instruction" eyebrow="CAN OS" width="wide">
    <p role="status">Opening authorized recorded-content tools…</p>
  </WorkspaceShell>}>
    {selected.trackVersionId
      ?<ProviderInstructionDraft key={selected.trackVersionId}
        trackVersionId={selected.trackVersionId} navigation={navigation}/>
      :<ProviderInstructionHome navigation={navigation}/>}
  </Suspense>;
  if(selected.view==="activities")return <Suspense fallback={<WorkspaceShell
    title="Course activities" eyebrow="CAN OS" width="wide">
    <p role="status">Opening authorized publisher tools…</p>
  </WorkspaceShell>}>
    <PublisherCourseActivityEditor key={selected.courseVersionId??"new"}
      navigation={navigation} preferredCourseVersionId={selected.courseVersionId}/>
  </Suspense>;
  return selected.view==="manage"
    ?<Suspense fallback={<WorkspaceShell title="Classes" eyebrow="CAN OS"
      width="wide"><p role="status">Opening Class management…</p></WorkspaceShell>}>
      <NativeClassManager key={`${selected.siteId??"all"}:${selected.offeringVersionId??"all"}`}
        preferredSiteId={selected.siteId}
        preferredOfferingVersionId={selected.offeringVersionId}
        navigation={navigation}/>
    </Suspense>
    :<NativeLearnerClasses navigation={navigation}/>;
}

function NativeLearnerClasses({navigation}:{navigation:ReactNode}){
  const client=useQueryClient();
  const requested=Route.useSearch();
  const [searchText,setSearchText]=useState(requested.search??"");
  const [search,setSearch]=useState(requested.search??"");
  const [filteredClassId,setFilteredClassId]=useState(requested.classId??"");
  const siteId=requested.siteId;
  const [deliveryMode,setDeliveryMode]=useState<"all"|"self_paced"|"scheduled"|"facilitated"|"hybrid">("all");
  const catalog=useInfiniteQuery({
    queryKey:["native-public-class-catalog",search,filteredClassId,siteId,deliveryMode],
    initialPageParam:null as {title:string;classId:string}|null,
    queryFn:({pageParam})=>getNativePublicClassCatalogPage({data:{
      search,cursor:pageParam,
      ...(filteredClassId?{classId:filteredClassId}:{}),
      ...(siteId?{siteId}:{}),
      ...(deliveryMode==="all"?{}:{deliveryMode}),
    }}),
    getNextPageParam:last=>last.nextCursor,
    retry:false,
  });
  const catalogItems=catalog.data?.pages.flatMap(page=>page.items)??[];
  const approvals=useQuery({
    queryKey:["native-my-class-approvals"],
    queryFn:()=>getMyNativeClassApprovals(),retry:false,
  });
  const invitations=useQuery({
    queryKey:["native-my-class-invitations"],
    queryFn:()=>getMyNativeClassInvitations(),retry:false,
  });
  const enrolled=useInfiniteQuery({
    queryKey:["native-my-class-enrollment-history"],
    initialPageParam:null as {enrolledAt:string;classEnrollmentId:string}|null,
    queryFn:({pageParam})=>getMyNativeClassEnrollmentHistoryPage({
      data:{cursor:pageParam},
    }),
    getNextPageParam:last=>last.nextCursor,
    retry:false,
  });
  const enrolledItems=enrolled.data?.pages.flatMap(page=>page.items)??[];
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["native-public-class-catalog",search,filteredClassId,siteId,deliveryMode]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["native-my-class-enrollment-history"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["native-my-class-invitations"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["native-my-class-approvals"]},{throwOnError:true}),
      // WS1 projects this source independently. Enrollment and withdrawal must
      // invalidate the unified view without writing a second participation row.
      client.invalidateQueries({queryKey:["my-activity"]},{throwOnError:true}),
    ]);
  }
  const recovery=useMutationFeedback(refresh);
  const recovering=recovery.pending||recovery.refreshFailed;
  async function recoverExistingNativeLearning(){
    if(recovering)return;
    await recovery.run(
      ()=>resumeLinkedNativeClassLearner(),
      {
        successMessage:"Your existing verified CAN learner identity is connected. You can continue without another login.",
        commandErrorMessage:"Class access could not be restored. An independently verified adult learner Person and current learner grant may be required.",
        refreshErrorMessage:"Your verified Class access was restored, but the Class list could not refresh. Retry refresh rather than restoring the session again.",
      },
    );
  }
  return <WorkspaceShell width="wide" eyebrow="My CAN" title="My Classes"
    subtitle="One Class enrollment and one learning record, regardless of whether your Class is academic, independent or facilitated."
    actions={<Link to="/learn/my-activity" className="text-sm font-semibold text-primary underline underline-offset-4">My Activity</Link>}>
    {navigation}
    {(enrolled.isError||approvals.isError||invitations.isError)&&
      <section className="mt-5 border border-border bg-card p-5" aria-label="Verified CAN learner session recovery">
        <h2 className="font-serif text-xl">Continue with your CAN account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          If your CAN account was previously verified and linked to your native learning
          Person, you can restore Class access using this login. This does not enroll
          you in any Class or create a new identity. New learner identities and age
          verification require the governed onboarding process.
        </p>
        <Button className="mt-3" type="button" variant="outline"
          disabled={recovering} onClick={()=>void recoverExistingNativeLearning()}>
          {recovering?"Checking linked identity…":"Restore verified Class access"}
        </Button>
        <MutationFeedback state={{...recovery,retryRefresh:recovery.retryRefresh}}
          pendingMessage="Restoring verified Class access…" className="mt-3"/>
      </section>}
    <section className="mt-6">
      <h2 className="font-serif text-2xl">My Class invitations</h2>
      {invitations.isPending&&<p role="status" className="mt-3 text-sm">
        Checking invitations for your verified Person…
      </p>}
      {invitations.isError&&<p role="alert" className="mt-3 text-sm">
        Your native Class invitations could not be verified.
      </p>}
      {invitations.isSuccess&&invitations.data.length===0&&
        <p className="mt-3 text-sm text-muted-foreground">No native Class invitations.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {invitations.data?.map(item=><InvitationCard key={item.invitationId}
          item={item} onChanged={refresh}/>)} 
      </div>
    </section>
    <section className="mt-6">
      <h2 className="font-serif text-2xl">My Class approvals</h2>
      {approvals.isError&&<p role="alert" className="mt-3 text-sm">Approval history could not be loaded.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {approvals.data?.map(item=><ApprovedClassCard key={item.approvalRequestId} item={item} onChanged={refresh}/>)}
      </div>
    </section>
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Enrolled Classes</h2>
      {enrolled.isPending&&<p role="status" className="mt-3 text-sm">Loading your Classes…</p>}
      {enrolled.isError&&<p role="alert" className="mt-3 border border-border p-4 text-sm">Native Class records are unavailable or access could not be verified.</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {enrolledItems.map(item=><EnrolledClassCard
          key={item.classEnrollmentId} item={item} onChanged={refresh} destinations={catalogItems}/>)}
      </div>
      {enrolled.isSuccess&&enrolledItems.length===0&&<p className="mt-4 text-sm text-muted-foreground">You have no native Class enrollments yet.</p>}
      {enrolled.hasNextPage&&<Button type="button" size="sm" variant="outline" className="mt-4"
        disabled={enrolled.isFetchingNextPage}
        onClick={()=>void enrolled.fetchNextPage()}>
        {enrolled.isFetchingNextPage?"Loading history…":"Load older Classes"}
      </Button>}
    </section>
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Explore Classes</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only currently published public Class Offerings are listed. Private and unlisted Classes are not shown.</p>
      {siteId&&<p className="mt-2 text-sm text-muted-foreground">
        Browsing public Classes at the selected Site. Current Site and Offering authority are verified on every page.
      </p>}
      <form className="mt-4 flex flex-wrap gap-2" role="search"
        onSubmit={event=>{event.preventDefault();setFilteredClassId("");setSearch(searchText.trim());}}>
        <Label className="sr-only" htmlFor="native-class-catalog-search">Search Classes</Label>
        <Input id="native-class-catalog-search" type="search" maxLength={100}
          value={searchText} onChange={event=>setSearchText(event.target.value)}
          placeholder="Search by Class name"
          className="min-h-11 min-w-[14rem] flex-1"/>
        <Label className="sr-only" htmlFor="native-class-delivery-mode">Delivery format</Label>
        <Select id="native-class-delivery-mode" value={deliveryMode}
          onChange={event=>setDeliveryMode(event.target.value as typeof deliveryMode)}
          className="min-h-11">
          <option value="all">All formats</option>
          <option value="self_paced">Self-paced</option>
          <option value="scheduled">Scheduled</option>
          <option value="facilitated">Facilitated</option>
          <option value="hybrid">Hybrid</option>
        </Select>
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
      {catalog.isError&&<p role="alert" className="mt-4 border border-border p-4 text-sm">Public Class discovery is unavailable. Please retry.</p>}
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
