import {useState} from "react";
import {ReportGeographyFilter} from "@/components/workspace/report-geography-filter";
import {useReportGeography} from "@/hooks/use-report-geography";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import { ReportChart } from "@/components/workspace/report-chart";
import {getNoncreditOperatorNetworkSummary} from "@/modules/enrollment/noncredit-network-report.functions";

/** Exact authorized operating-organization aggregation. Publishing a national
 * report requires separate network membership authority and disclosure review. */
export function NoncreditNetworkReportPanel(){
  const scope=usePrivateReportScope();
  const [geography,setGeography]=useState("");
  const options=useReportGeography(scope,"current");
  const {query:report,data}=usePrivateReportQuery({scope,key:["provider-delivery",geography],read:()=>getNoncreditOperatorNetworkSummary({data:{geography}})});
  const totals=data?.totals;
  if(scope===null)return null;
  return <section className="mt-7 border border-border bg-card p-5" aria-label="Noncredit program impact">
    <h2 className="font-serif text-2xl">Program participation & outcomes</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Across enrollment releases owned by the current authorized operating organization,
      including authorized Sites. This is not a national cross-organization report.
    </p>
    <div className="mt-4"><ReportGeographyFilter value={geography} options={options.data??[]} onChange={setGeography} basis="current" loading={options.query.isFetching} error={options.query.isError}/></div>
    {(report.isPending||report.isFetching)&&<p role="status" className="mt-4 text-sm">Reconciling registration and verified learning evidence…</p>}
    {report.isError&&<p role="alert" className="mt-4 text-sm">
      Reporting is unavailable or its bounded dataset needs partitioning.
      <Button variant="ghost" type="button" className="ml-2 text-primary underline" onClick={()=>void report.refetch()}>Retry</Button>
    </p>}
    {totals&&<>
      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {([
          ["Registrations",totals.registrations],
          ["Currently registered",totals.active],
          ["Withdrawn",totals.withdrawn],
          ["Confirmed completions",totals.completed],
          ["Verified attendees",totals.verifiedAttendees],
          ["Linked delivered rooms",totals.linkedRooms],
        ] as const).map(([label,value])=>
          <div key={label} className="border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 font-serif text-3xl tabular-nums">{value.toLocaleString()}</dd>
          </div>)}
      </dl>
      {data!.sites.length>0&&data!.sites.length<=20&&<div className="mt-5">
        <ReportChart spec={{title:"Registrations by delivery Site",description:"Authorized Site totals, not a national cross-organization report.",
          valueLabel:"Registrations",kind:"comparison",format:"count",
          points:data!.sites.map(site=>({id:site.siteId,label:site.siteName,value:site.registrations}))}}/>
      </div>}
      <div className="mt-5 border border-border">
        <Table scrollLabel="Site participation totals" aria-label="Site participation totals" className="text-left"><TableCaption className="sr-only">Site participation totals</TableCaption>
          <TableHeader><TableRow className="border-b border-border bg-muted/30">
            <TableHead scope="col" className="p-3">Site</TableHead><TableHead scope="col" className="p-3">Registered</TableHead>
            <TableHead scope="col" className="p-3">Attended</TableHead><TableHead scope="col" className="p-3">Completed</TableHead>
          </TableRow></TableHeader>
          <TableBody>{data!.sites.map(site=><TableRow key={site.siteId} className="border-b border-border">
            <TableRowHead className="p-3 font-medium">{site.siteName}</TableRowHead>
            <TableCell className="p-3 tabular-nums">{site.registrations}</TableCell>
            <TableCell className="p-3 tabular-nums">{site.verifiedAttendees}</TableCell>
            <TableCell className="p-3 tabular-nums">{site.completed}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      {data!.affiliations.length>0&&<section className="mt-6">
        <h3 className="text-sm font-semibold">Organizations credited for participation</h3>
        <p className="mt-2 text-xs text-muted-foreground">Local affiliation is self-reported unless separately verified. Site and affiliation totals represent the same registrations, not additional people served.</p>
        <div className="mt-3 border border-border">
          <Table scrollLabel="Participation by affiliated organization" aria-label="Participation by affiliated organization" className="text-left"><TableCaption className="sr-only">Participation by affiliated organization</TableCaption>
            <TableHeader><TableRow className="border-b border-border bg-muted/30">
              <TableHead scope="col" className="p-3">Organization</TableHead>
              <TableHead scope="col" className="p-3">Reporting unit at registration</TableHead>
              <TableHead scope="col" className="p-3">Basis</TableHead>
              <TableHead scope="col" className="p-3">Registrations</TableHead>
              <TableHead scope="col" className="p-3">Completed</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data!.affiliations.map(row=>
              <TableRow key={[row.organizationId,row.networkMembershipId??"provider",row.reportingUnitId??"none",row.basis].join(":")} className="border-b border-border">
                <TableRowHead className="p-3 font-medium">{row.organizationName}</TableRowHead>
                <TableCell className="p-3">{row.reportingUnitName??"Provider Site"}</TableCell>
                <TableCell className="p-3">{row.basis==="self_reported"?"Self-reported local":"Provider default"}</TableCell>
                <TableCell className="p-3 tabular-nums">{row.registrations}</TableCell>
                <TableCell className="p-3 tabular-nums">{row.completed}</TableCell>
              </TableRow>)}</TableBody>
          </Table>
        </div>
      </section>}
      {data!.networkUnits.length>0&&<section className="mt-6">
        <h3 className="text-sm font-semibold">Network reporting units</h3>
        <p className="mt-2 text-xs text-muted-foreground">Each participant is counted once per level in the snapshotted network path. Do not sum totals from different levels.</p>
        <div className="mt-3 border border-border">
          <Table scrollLabel="Network reporting units" aria-label="Network reporting units" className="text-left"><TableCaption className="sr-only">Network reporting units</TableCaption>
            <TableHeader><TableRow className="border-b border-border bg-muted/30">
              <TableHead scope="col" className="p-3">Unit</TableHead>
              <TableHead scope="col" className="p-3">Registered</TableHead>
              <TableHead scope="col" className="p-3">Completed</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data!.networkUnits.map(row=>
              <TableRow key={row.unitId} className="border-b border-border">
                <TableRowHead className="p-3 font-medium">{row.unitName}</TableRowHead>
                <TableCell className="p-3 tabular-nums">{row.registrations}</TableCell>
                <TableCell className="p-3 tabular-nums">{row.completed}</TableCell>
              </TableRow>)}</TableBody>
          </Table>
        </div>
      </section>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{data?.notice}</p>
      <p className="mt-2 text-xs text-muted-foreground">Public-safe site totals suppress counts below {data?.publicationSafe.minimumCell}. The exact figures above are private to the authorized operator.</p>
    </>}
  </section>;
}
