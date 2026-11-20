import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { Button } from "@/components/ui/button";
import { getUnifiedClassCourseOptions } from "@/modules/classes/unified-class.functions";
import { getNativeOfferingVersionImpact } from "@/modules/programs/publisher-version-impact.functions";
import { localClassFields, publisherOwnedFields } from "@/domain/publisher-class-variation";
import { projectedRolloutStages } from "@/domain/program-rollout-lifecycle";

/**
 * One operator-facing administrative entry point. Published product authority
 * remains with publisher editors and independent reviewers. This route is an
 * authorized READ of local adoptions, versions and delivery readiness.
 */
export const Route=createFileRoute("/canonical/program-operations")({
  loader:async({context})=>{
    const result=await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if(!result.session?.authenticated)
      throw redirect({to:"/access",search:{returnTo:"/canonical/program-operations"}});
  },
  component:ProgramOperations,
});

function ProgramOperations(){
  const [searchInput,setSearchInput]=useState("");
  const [search,setSearch]=useState("");
  const [selectedKey,setSelectedKey]=useState("");
  const catalog=useInfiniteQuery({
    queryKey:["program-operations-catalog",search],
    initialPageParam:0,
    queryFn:({pageParam})=>getUnifiedClassCourseOptions({data:{search,cursor:pageParam}}),
    getNextPageParam:page=>page.nextCursor??undefined,
    retry:false,
  });
  const rows=catalog.data?.pages.flatMap(page=>page.items)??[];
  const grouped=new Map<string,typeof rows>();
  for(const row of rows){
    const key=[row.deploymentId,row.adoptionId,row.offeringVersionId].join(":");
    grouped.set(key,[...(grouped.get(key)??[]),row]);
  }
  const groups=[...grouped].map(([key,components])=>({
    key,first:components[0]!,
    components:components
      .filter((row,index)=>components.findIndex(other=>other.courseVersionId===row.courseVersionId)===index)
      .sort((a,b)=>(a.sequenceNo??Number.MAX_SAFE_INTEGER)-(b.sequenceNo??Number.MAX_SAFE_INTEGER)),
  }));
  const selected=groups.find(group=>group.key===selectedKey)??null;
  const impact=useQuery({
    queryKey:["program-operations-version-impact",selected?.first.offeringId],
    enabled:!!selected,
    queryFn:()=>getNativeOfferingVersionImpact({data:{offeringId:selected!.first.offeringId}}),
    retry:false,
  });
  const impactData=impact.data;
  const classVersions=impactData?.localClassImpact.filter(row=>
    row.offeringVersionId===selected?.first.offeringVersionId &&
    row.deploymentId===selected?.first.deploymentId)??[];
  const classesAtVersion=classVersions.reduce((total,row)=>total+row.classCount,0);
  const activeAtVersion=classVersions.filter(row=>row.state==="active")
    .reduce((total,row)=>total+row.classCount,0);
  const publishedAtVersion=(impactData?.publishedClassOfferings??[])
    .filter(row=>row.offeringVersionId===selected?.first.offeringVersionId &&
      row.deploymentId===selected?.first.deploymentId)
    .reduce((total,row)=>total+row.classCount,0);
  const rolloutStages=projectedRolloutStages({
    publisherPublished:!!selected,
    adoptionApproved:!!selected,
    siteAuthorized:!!selected?.first.siteOptions.length,
    localClassCount:classesAtVersion,
    activeClassCount:activeAtVersion,
    publishedClassOfferingCount:publishedAtVersion,
  });
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Publisher and Program Operations"
    title="Program operations"
    subtitle="Follow the approved publisher product from immutable Course versions to each authorized local Class. Independent operators do not need a network affiliation."
    actions={<div className="flex flex-wrap gap-4 text-sm font-semibold">
      <Link to="/class" search={{view:"manage"}} className="underline underline-offset-4">Manage local Classes</Link>
      <Link to="/canonical/blueprints" className="underline underline-offset-4">Publisher Blueprints</Link>
      <Link to="/canonical/lab/deployments" className="underline underline-offset-4">Deployments and adoption</Link>
    </div>}>
    <section className="mt-5 border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Approved Products</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your current operating Organization and authorized Sites determine what appears.
        Published content belongs to its publisher. This page cannot approve publisher changes.
      </p>
      <form onSubmit={event=>{event.preventDefault();setSearch(searchInput.trim());setSelectedKey("");}}
        className="mt-4 flex flex-wrap items-end gap-3">
        <Label className="min-w-[15rem] flex-1 text-sm font-semibold" htmlFor="program-search">
          Program, Course or Deployment
          <Input id="program-search" value={searchInput} maxLength={100}
            onChange={event=>setSearchInput(event.target.value)}
            className="mt-1 min-h-11"
            placeholder="Search approved products"/>
        </Label>
        <Button type="submit">Search</Button>
        {search&&<Button type="button" variant="outline" onClick={()=>{
          setSearch("");setSearchInput("");setSelectedKey("");
        }}>Clear</Button>}
      </form>
      {catalog.isPending&&<p role="status" className="mt-4 text-sm">Checking approved Programs and Courses…</p>}
      {catalog.isError&&<p role="alert" className="mt-4 text-sm">
        This workspace is not available for the current operator or release environment.
      </p>}
      {catalog.isSuccess&&groups.length===0&&<p className="mt-4 text-sm text-muted-foreground">
        No matching published, adopted Courses are currently available within your authorized Sites.
      </p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {groups.map(group=><article key={group.key} className="border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.first.offeringKind==="program"?"Program":
              group.first.offeringKind==="course"?"Standalone Course":"Published Offering"}
            {" · "}publisher version {group.first.offeringVersionNo}
          </p>
          <h3 className="mt-2 font-semibold">{group.first.offeringTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.first.deploymentName} · {group.components.length} loaded Course component(s)
          </p>
          <ul className="mt-3 space-y-2">
            {group.components.map(course=><li key={course.courseVersionId}
              className="border-t border-border pt-2 text-sm">
              <span className="font-semibold">{course.courseTitle} v{course.courseVersionNo}</span>
              <span className="text-muted-foreground">
                {" · "}{course.isRequired?"Required":"Optional"}
                {" · "}{course.siteOptions.length} authorized Site(s)
              </span>
            </li>)}
          </ul>
          <Button type="button" variant="outline" className="mt-4"
            onClick={()=>setSelectedKey(group.key)}>Review rollout</Button>
        </article>)}
      </div>
      {catalog.hasNextPage&&<Button type="button" variant="outline" className="mt-4"
        disabled={catalog.isFetchingNextPage} onClick={()=>void catalog.fetchNextPage()}>
        {catalog.isFetchingNextPage?"Loading…":"Load more approved products"}
      </Button>}
    </section>
    {selected&&<section className="mt-5 border border-border bg-card p-5"
      aria-label="Selected Offering rollout and version impact">
      <h2 className="font-serif text-2xl">{selected.first.offeringTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Local Deployment: {selected.first.deploymentName}. Adopted publisher Offering v{selected.first.offeringVersionNo}.
        A new publisher release does not upgrade active Classes automatically.
      </p>
      {impactData&&<div className="mt-4 grid gap-3 md:grid-cols-3">
        {rolloutStages.map(stage=><div key={stage.key} className="border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {stage.complete?"Verified stage":"Not yet verified"}
          </p>
          <p className="mt-1 text-sm font-semibold">{stage.label}</p>
        </div>)}
      </div>}
      <p className="mt-2 text-xs text-muted-foreground">
        These milestones are derived from current canonical records. They are not a replacement
        for durable publisher approvals or an authoritative rollout event ledger.
      </p>
      {impact.isPending&&<p role="status" className="mt-4 text-sm">Checking publisher version impact…</p>}
      {impact.isError&&<p role="alert" className="mt-4 text-sm">
        Version impact cannot be verified under the current scope. No upgrade recommendation is available.
      </p>}
      {impactData&&<div className="mt-4 border-t border-border pt-4">
        <h3 className="text-lg font-semibold">Version impact</h3>
        <p className="mt-2 text-sm">
          Latest published publisher version: <strong>{impactData.latestPublishedVersionNo??"Unknown"}</strong>.
          {" "}Current Deployment adoption: <strong>v{selected.first.offeringVersionNo}</strong>.
          {impactData.latestPublishedVersionNo!==null&&
            impactData.latestPublishedVersionNo>selected.first.offeringVersionNo
            ?" A newer version requires separate review and approved adoption.":" No newer published version was found."}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Within this Deployment and its currently authorized Sites, {classesAtVersion} Class(es)
          reference this pinned version; {activeAtVersion} are active.
          {publishedAtVersion} Class(es) have a published optional registration Offering.
          The full Class counts come from the server, not this page's limited Class list.
        </p>
        {impactData.publisherVersionsTruncated&&<p className="mt-2 text-xs text-muted-foreground">
          More than 100 publisher versions exist. The version history shown here is limited.
        </p>}
        <h4 className="mt-4 text-sm font-semibold">Approved local adoption by Site</h4>
        <div className="mt-2 space-y-2">
          {impactData.approvedAdoptions.map(adoption=><div key={adoption.adoptionId}
            className="border border-border p-3 text-sm">
            <p className="font-semibold">
              {adoption.deploymentName} · publisher version {adoption.versionNo}
              {impactData.latestPublishedVersionNo!==null&&
                adoption.versionNo<impactData.latestPublishedVersionNo
                ?" · Newer publisher version available":""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approved adoption does not by itself grant access to another Organization or Site.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {impactData.adoptionSites.filter(site=>site.adoptionId===adoption.adoptionId)
                .map(site=><span key={site.siteId}
                  className="border border-border bg-muted/20 px-2 py-1 text-xs">
                  {site.siteName} · {site.classroomPlacement?"Classroom placement":"Self-paced Site only"}
                </span>)}
            </div>
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/canonical/lab/deployments" className="underline">Review approved adoption</Link>
          <Link to="/class" search={{view:"manage"}} className="underline">Prepare or revise local Class</Link>
        </div>
      </div>}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="border border-border p-4">
          <h3 className="font-semibold">Publisher-controlled and immutable</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The receiving operator cannot replace these by editing a Class.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {publisherOwnedFields.map(field=><li key={field}>{field}</li>)}
          </ul>
        </div>
        <div className="border border-border p-4">
          <h3 className="font-semibold">Locally configurable, subject to approval</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Local choices still require Site grants and any publisher Class policy.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {localClassFields.map(field=><li key={field}>{field}</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Publisher variation approvals outside the published policy require a separately governed workflow.
          </p>
        </div>
      </div>
      <h3 className="mt-5 font-semibold">Classes affected by publisher version changes</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        These Classes belong to currently authorized Deployment/Site combinations in your
        operating Organization. Each Class remains pinned to its original Offering and
        Course versions until a separately approved local change.
      </p>
      {!impactData&&<p role="status" className="mt-2 text-sm">Verifying affected Class identities…</p>}
      {impactData&&impactData.affectedClasses.length===0&&
        <p className="mt-2 text-sm text-muted-foreground">No currently authorized local Classes found for this Offering.</p>}
      {impactData&&<div className="mt-3 grid gap-2 md:grid-cols-2">
        {impactData.affectedClasses.map(cls=><Link key={cls.classId} to="/class/$classId"
          params={{classId:cls.classId}} search={{view:"manage",tab:"sessions"}}
          className="block border border-border p-3 text-sm underline underline-offset-4">
          <strong>{cls.title}</strong>
          <span className="block mt-1 text-xs text-muted-foreground">
            Publisher v{cls.versionNo} · {cls.state} · {cls.deliveryMode.replaceAll("_"," ")}
          </span>
          <span className="block mt-1 text-xs text-muted-foreground">
            {impactData.adoptionSites.find(site=>site.siteId===cls.siteId&&
              site.deploymentId===cls.deploymentId)?.siteName??"Authorized Site"}
            {impactData.latestPublishedVersionNo!==null&&
              cls.versionNo<impactData.latestPublishedVersionNo
              ?" · Review newer publisher version":""}
          </span>
        </Link>)}
      </div>}
      {impactData?.moreAffectedClasses&&<p className="mt-2 text-xs text-muted-foreground">
        Only the first 100 affected Classes are shown. Counts above include all authorized
        Classes. Use the Class workspace for focused lookup before any migration decision.
      </p>}
    </section>}
  </WorkspaceShell>;
}
