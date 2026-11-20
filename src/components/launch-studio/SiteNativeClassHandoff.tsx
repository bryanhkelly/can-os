import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";
import { WorkspacePanel } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { getLaunchSiteClassScope } from "@/modules/programs/program-discovery.functions";
import { getMyUnifiedClassDrafts, getUnifiedClassCourseOptions, getNativeClassOperatorSites } from "@/modules/classes/unified-class.functions";
import { NativeClassLaunchReadiness } from "@/components/learning/NativeClassLaunchReadiness";
import { NativeClassSummary } from "@/components/learning/NativeClassSummary";
import { nativeClassOperatorQueryKeys } from "@/domain/native-class-operator-query-keys";
import { nativeClassAvailabilityQueryKeys } from "@/lib/native-class-availability-cache";
import { ProgramDiscoveryPanel } from "./ProgramDiscoveryPanel";

/** One Site UUID across Launch Studio and Class. This scope read checks the
 * current Site and canonical operator rights; it never consults an identity
 * crosswalk or grants authority through the URL. */
export function SiteNativeClassHandoff({publicSiteId}:{publicSiteId:string}){
 const scope=useQuery({queryKey:["launch-native-class-scope",publicSiteId],
   queryFn:()=>getLaunchSiteClassScope({data:{siteId:publicSiteId}}),retry:false});
 const canonicalSiteId=scope.data?.kind==="ready"?publicSiteId:null;
 const classesRead=useQuery({queryKey:nativeClassOperatorQueryKeys.site(canonicalSiteId),
   queryFn:()=>getMyUnifiedClassDrafts({data:{siteId:canonicalSiteId!}}),enabled:Boolean(canonicalSiteId),retry:false});
 const adoptedCourses=useQuery({queryKey:[...nativeClassAvailabilityQueryKeys.launchPage,canonicalSiteId],
   queryFn:()=>getUnifiedClassCourseOptions({data:{siteId:canonicalSiteId!,search:"",cursor:0}}),
   enabled:Boolean(canonicalSiteId),retry:false});
 const operatorSites=useQuery({
   queryKey:["native-class-operator-sites"],
   queryFn:()=>getNativeClassOperatorSites(),
   enabled:Boolean(canonicalSiteId),retry:false,
 });
 const classes=classesRead.data??[];
 return <WorkspacePanel title="Turn an approved Course into a Class"
    className="mt-6"
    description="One four-session pilot uses one Class with four dated Sessions. Course adoption, enrollment and facilitator access remain separately authorized.">
  {scope.isPending&&<p role="status" className="mt-4 text-sm">
   Checking this Site's current Class permissions…
  </p>}
  {scope.isError&&<div role="alert" className="mt-4 border border-border bg-card p-4 text-sm">
    <p>Unable to verify your Site permissions. A verified Site administrator
      or registrar session is required to manage Classes.</p>
    <Link to="/access" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline">
      Sign in to manage this Site
    </Link>
  </div>}
  {!scope.isPending&&!scope.isError&&scope.data?.kind!=="ready"&&<>
   <p role="status" className="mt-4 border border-border bg-muted p-4 text-sm">
    {scope.data?.kind==="not_provisioned"
      ?"This Site does not yet have native Class operations provisioned under its existing Site ID."
      :"The current account does not have an active native Class administration grant for this Site."}
    {" "}Creating a Class requires a published adopted Course and current operating authority.
    No additional Site or identity correspondence is created.
   </p>
   <Link to="/class" search={{view:"manage",siteId:publicSiteId}}
    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
    Open Class management <ArrowRight className="size-4"/>
   </Link>
  </>}
  {canonicalSiteId&&<>
   {classesRead.isPending&&<p role="status" className="mt-4 text-sm">Checking current native Class permissions…</p>}
   {classesRead.isError&&<p role="alert" className="mt-4 border p-4 text-sm">
    Unified Classroom is unavailable for the current canonical grant or database release.
    No Class absence or release readiness is assumed.
   </p>}
   {classesRead.isSuccess&&<>
    <ProgramDiscoveryPanel siteId={publicSiteId}/>
    <div className="mt-4">
      <NativeClassLaunchReadiness state={{
        operatorSites:operatorSites.status,
        authorizedSiteCount:(operatorSites.data??[]).filter(site=>site.id===canonicalSiteId).length,
        adoptedCourses:adoptedCourses.status,
        visibleAdoptedCourseCount:adoptedCourses.data?.items.length??0,
        visibleDraftClasses:classesRead.status,
        visibleDraftClassCount:classes.length,
        filtered:false,
      }}/>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
     <Button asChild size="lg"><Link to="/class" search={{view:"manage",siteId:canonicalSiteId??undefined}}>
      Create Class from approved Course <ArrowRight className="size-4"/>
     </Link></Button>
     <Button asChild size="lg" variant="outline"><Link to="/canonical/blueprints" search={{siteId:canonicalSiteId}}>
      Review Course adoption <ArrowRight className="size-4"/>
     </Link></Button>
    </div>
    {classes.length>0&&<ul className="mt-4 grid gap-3 md:grid-cols-2">
      {classes.map(item=><li key={item.classId}>
        <NativeClassSummary item={item}>
          {item.state==="active"?<>
            <Link to="/class/$classId" params={{classId:item.classId}}
              search={{view:"manage",tab:"overview"}}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">
              Assign a Class facilitator <ArrowRight className="size-4"/>
            </Link>
            <Link to="/class/$classId" params={{classId:item.classId}}
              search={{view:"manage",tab:"sessions"}}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">
              <CalendarDays className="size-4"/> Review Sessions <ArrowRight className="size-4"/>
            </Link>
          </>:<Link to="/class" search={{view:"manage",siteId:canonicalSiteId??undefined}}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">
            Activate draft Class <ArrowRight className="size-4"/>
          </Link>}
        </NativeClassSummary>
      </li>)}
    </ul>}
   </>}
  </>}
  <p className="mt-4 text-xs leading-5 text-muted-foreground">
   Class managers assign an authorized facilitator; that facilitator schedules and runs
   Sessions from the Class teaching view. A Class Offering is optional for private
   assignment. Portable network Class recipes contain no learner, grant or Course-content rights.
  </p>
 </WorkspacePanel>;
}
