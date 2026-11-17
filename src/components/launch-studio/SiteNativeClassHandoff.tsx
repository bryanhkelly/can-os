import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { getSiteIdentityLinkStatus } from "@/modules/sites/site-identity-links.functions";
import { getMyUnifiedClassDrafts, getUnifiedClassCourseOptions } from "@/modules/classes/unified-class.functions";
import { resolveSiteClassLink } from "@/domain/site-class-launch-handoff";
import { ProgramDiscoveryPanel } from "./ProgramDiscoveryPanel";

/** Site-first to native-Class handoff: a public Site ID is never used as a
 * canonical Site ID or an authorization credential. Native reads independently
 * validate the current canonical session and exact Site privileges. */
export function SiteNativeClassHandoff({publicSiteId}:{publicSiteId:string}){
 const identity=useQuery({queryKey:["launch-native-class-link",publicSiteId],
   queryFn:()=>getSiteIdentityLinkStatus({data:{publicSiteId}}),retry:false});
 const link=resolveSiteClassLink(identity.data??null);
 const canonicalSiteId=link.kind==="approved"?link.canonicalSiteId:null;
 const classesRead=useQuery({queryKey:["launch-native-classes",canonicalSiteId],
   queryFn:()=>getMyUnifiedClassDrafts(),enabled:Boolean(canonicalSiteId),retry:false});
 const adoptedCourses=useQuery({queryKey:["launch-class-course-adoptions",canonicalSiteId],
   queryFn:()=>getUnifiedClassCourseOptions({data:{siteId:canonicalSiteId!,search:"",cursor:0}}),
   enabled:Boolean(canonicalSiteId),retry:false});
 const classes=canonicalSiteId
   ?(classesRead.data??[]).filter(item=>item.siteId===canonicalSiteId):[];
 return <section className="mt-6 border p-5" aria-label="Unified Classroom handoff">
  <p className="text-xs font-bold uppercase tracking-wide text-primary">Classes and delivery</p>
  <h3 className="mt-2 flex items-center gap-2 font-serif text-2xl"><Users className="size-5"/> Turn an approved Course into a Class</h3>
  <p className="mt-2 text-sm leading-6 text-muted-foreground">
   The Site hosts approved learning. Classroom manages Classes, optional registration Offerings,
   facilitator permissions, dated Sessions, participant enrollment and recorded playback.
   One four-session pilot is one Class with four Sessions, not four copied Courses.
  </p>
  {identity.isPending&&<p role="status" className="mt-4 text-sm">Checking verified Site correspondence…</p>}
  {identity.isError&&<div role="alert" className="mt-4 border border-border bg-card p-4 text-sm">
    <p>Site identity cannot be verified for this account. Sign in with an assigned Site
      administrator or registrar account, or ask a platform administrator to review
      the Site assignment. Class management remains unavailable until verified.</p>
    <Link to="/access" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
      Sign in to manage this Site
    </Link>
  </div>}
  {!identity.isPending&&!identity.isError&&link.kind!=="approved"&&<>
   <p role="status" className="mt-4 border bg-muted p-4 text-sm">
    {link.kind==="pending"?"Site identity confirmation and independent review are pending."
     :link.kind==="blocked"?"This Site's native identity relationship is not approved.":"No approved canonical Site relationship exists yet."}
    {" "}Class creation requires a verified canonical operator and an approved Course adoption.
   </p>
   <Link to="/site-identity" search={{mode:"request",siteId:publicSiteId}}
    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
    Review Site identity <ArrowRight className="size-4"/>
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
    <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Class activation progression">
      <div className="border border-border p-3 text-xs"><strong className="block text-sm">1. Approved Courses</strong>
        <p className="mt-2">{adoptedCourses.isError?"Unable to verify local Course adoption"
          :adoptedCourses.isPending?"Checking adopted Courses"
          :adoptedCourses.data.items.length>0?"Authorized Course options available":"No eligible adopted Courses are visible"}</p>
      </div>
      <div className="border border-border p-3 text-xs"><strong className="block text-sm">2. Classes</strong>
        <p className="mt-2">{classes.length} visible at this Site. {classes.some(item=>item.state==="active")
          ?"An active Class exists.":"Activate a draft Class after Course adoption."}</p>
      </div>
      <div className="border border-border p-3 text-xs"><strong className="block text-sm">3. Registration and Sessions</strong>
        <p className="mt-2">{classes.some(item=>item.offeringState==="published")
          ?"A Class Offering is published; Sessions have separate scheduling."
          :"Publishing a Class Offering is optional. Facilitation and Session scheduling have separate permissions."}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
     <Link to="/class" search={{view:"manage",siteId:canonicalSiteId??undefined}}
      className="inline-flex min-h-11 items-center gap-2 border bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
      Create Class from approved Course <ArrowRight className="size-4"/>
     </Link>
     <Link to="/canonical/blueprints" search={{siteId:canonicalSiteId}}
      className="inline-flex min-h-11 items-center gap-2 border px-4 py-3 text-sm font-semibold text-primary">
      Review Course adoption <ArrowRight className="size-4"/>
     </Link>
    </div>
    {adoptedCourses.isSuccess&&adoptedCourses.data.items.length===0&&
      <p role="status" className="mt-4 border border-border p-4 text-sm">
        There is no currently authorized adopted Course available for Class creation at this Site.
        Review the governed Blueprint, Offering and Deployment adoption before creating a Class.
      </p>}
    {classes.length===0?<p className="mt-4 text-sm text-muted-foreground">
     No native Classes are visible for this exact Site. This does not certify Site readiness.
    </p>:<ul className="mt-4 grid gap-3 md:grid-cols-2">{classes.map(item=><li key={item.classId} className="border bg-card p-4">
     <p className="font-semibold">{item.title}</p>
     <p className="mt-1 text-xs text-muted-foreground">
      {item.state.replaceAll("_"," ")} · {item.deliveryMode.replaceAll("_"," ")}
      {item.offeringState?" · Offering: "+item.offeringState:" · No Class Offering required"}
     </p>
     {item.state==="active"?<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
      <Link to="/class/$classId" params={{classId:item.classId}}
       search={{view:"manage",tab:"overview",lesson:undefined,session:undefined}}
       className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
       Assign a Class facilitator <ArrowRight className="size-4"/>
      </Link>
      <Link to="/class/$classId" params={{classId:item.classId}}
       search={{view:"manage",tab:"sessions",lesson:undefined,session:undefined}}
       className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
       <CalendarDays className="size-4"/> Review Sessions <ArrowRight className="size-4"/>
      </Link>
     </div>:<Link to="/class" search={{view:"manage",siteId:canonicalSiteId??undefined}}
       className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
       Activate draft Class <ArrowRight className="size-4"/>
     </Link>}
    </li>)}</ul>}
   </>}
  </>}
  <p className="mt-4 text-xs leading-5 text-muted-foreground">
   Class managers assign an authorized facilitator; that facilitator schedules and runs
   Sessions from the Class teaching view. A Class Offering is optional for private
   assignment. Portable network Class recipes contain no learner, grant or Course-content rights.
  </p>
 </section>;
}
