export interface FamilyReadinessOverview {
 program:string;stage:string;journeyStatus?:string|null;
 activeSchoolYears:readonly unknown[];offers:readonly {status:string;respondedAt?:string|Date|null;schoolYearId:string}[];
 readiness:{completed:number;total:number;blockers:number};
}
export function FamilyReadinessOverviewCard({application}:{application:FamilyReadinessOverview}) {
 const active=application.activeSchoolYears.length>0;
 const next=active?"Enrollment active — prepare for school":
  application.offers.some(offer=>offer.status==="accepted")?"Registrar activation pending":
  application.offers.some(offer=>offer.status==="issued")?"Guardian response pending":
  application.readiness.blockers?"Complete blocking requirements":"Ready for an admissions offer";
 return <>
  <p className="font-semibold">{application.program} · {application.stage}</p>
  <p className="mt-2 text-sm">Next step: <strong>{next}</strong></p>
  <div className="mt-3 flex flex-wrap gap-2">{application.offers.map((offer,index)=><span key={offer.schoolYearId+":"+offer.status+":"+index} className="rounded-md border px-2 py-1 text-xs">Offer: {offer.status}{offer.respondedAt?" · Responded "+new Date(offer.respondedAt).toLocaleDateString():""}</span>)}</div>
  <p className="mt-2 text-sm">Journey: <strong>{application.journeyStatus?.replaceAll("_"," ")??"Not started"}</strong> · Program enrollment: <strong>{active?"Active":"Not active"}</strong></p>
  {active&&<p className="mt-1 text-xs text-muted-foreground">Active school-year records: {application.activeSchoolYears.length}</p>}
  <p className="mt-1 text-sm text-muted-foreground">{application.readiness.completed} of {application.readiness.total} requirements complete · {application.readiness.blockers} blocking</p>
 </>;
}
