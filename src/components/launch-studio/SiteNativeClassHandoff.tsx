import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { getSiteIdentityLinkStatus } from "@/modules/sites/site-identity-links.functions";
import { getMyUnifiedClassDrafts } from "@/modules/classes/unified-class.functions";
import { resolveSiteClassLink } from "@/domain/site-class-launch-handoff";

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
  {identity.isError&&<p role="alert" className="mt-4 border p-4 text-sm">Site identity is unavailable. Classroom authority is not assumed.</p>}
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
    <div className="mt-4 flex flex-wrap gap-3">
     <Link to="/canonical/classes" search={{siteId:canonicalSiteId}}
      className="inline-flex min-h-11 items-center gap-2 border bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
      Create Class from approved Course <ArrowRight className="size-4"/>
     </Link>
     <Link to="/canonical/blueprints" search={{siteId:canonicalSiteId}}
      className="inline-flex min-h-11 items-center gap-2 border px-4 py-3 text-sm font-semibold text-primary">
      Review Course adoption <ArrowRight className="size-4"/>
     </Link>
    </div>
    {classes.length===0?<p className="mt-4 text-sm text-muted-foreground">
     No native Classes are visible for this exact Site. This does not certify Site readiness.
    </p>:<ul className="mt-4 grid gap-3 md:grid-cols-2">{classes.map(item=><li key={item.classId} className="border bg-card p-4">
     <p className="font-semibold">{item.title}</p>
     <p className="mt-1 text-xs text-muted-foreground">
      {item.state.replaceAll("_"," ")} · {item.deliveryMode.replaceAll("_"," ")}
      {item.offeringState?" · Offering: "+item.offeringState:" · No Class Offering required"}
     </p>
     {item.state==="active"?<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
      <Link to="/classes/$classId" params={{classId:item.classId}}
       search={{view:"manage",tab:"overview",lesson:undefined,session:undefined}}
       className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
       Assign a Class facilitator <ArrowRight className="size-4"/>
      </Link>
      <Link to="/classes/$classId" params={{classId:item.classId}}
       search={{view:"manage",tab:"sessions",lesson:undefined,session:undefined}}
       className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
       <CalendarDays className="size-4"/> Review Sessions <ArrowRight className="size-4"/>
      </Link>
     </div>:<Link to="/canonical/classes" search={{siteId:canonicalSiteId}}
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
