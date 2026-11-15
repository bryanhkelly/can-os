import {useQuery} from "@tanstack/react-query";
import {getNoncreditOperatorNetworkSummary} from "@/modules/enrollment/noncredit-network-report.functions";

/** Exact authorized operating-organization aggregation. Publishing a national
 * report requires separate network membership authority and disclosure review. */
export function NoncreditNetworkReportPanel(){
  const report=useQuery({
    queryKey:["noncredit-operator-network-report"],
    queryFn:()=>getNoncreditOperatorNetworkSummary(),
    retry:false,staleTime:30_000,
  });
  const totals=report.data?.totals;
  return <section className="mt-7 border border-border bg-card p-5" aria-label="Noncredit program impact">
    <h2 className="font-serif text-2xl">Program participation & outcomes</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Across enrollment releases owned by the current authorized operating organization,
      including authorized Sites. This is not a national cross-organization report.
    </p>
    {report.isPending&&<p role="status" className="mt-4 text-sm">Reconciling registration and verified learning evidence…</p>}
    {report.isError&&<p role="alert" className="mt-4 text-sm">
      Reporting is unavailable or its bounded dataset needs partitioning.
      <button type="button" className="ml-2 text-primary underline" onClick={()=>void report.refetch()}>Retry</button>
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
      <div className="mt-5 overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th scope="col" className="p-3">Site</th><th scope="col" className="p-3">Registered</th>
            <th scope="col" className="p-3">Attended</th><th scope="col" className="p-3">Completed</th>
          </tr></thead>
          <tbody>{report.data.sites.map(site=><tr key={site.siteId??"independent"} className="border-b border-border">
            <th scope="row" className="p-3 font-medium">{site.siteName}</th>
            <td className="p-3 tabular-nums">{site.registrations}</td>
            <td className="p-3 tabular-nums">{site.verifiedAttendees}</td>
            <td className="p-3 tabular-nums">{site.completed}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{report.data?.notice}</p>
      <p className="mt-2 text-xs text-muted-foreground">Public-safe site totals suppress counts below {report.data?.publicationSafe.minimumCell}. The exact figures above are private to the authorized operator.</p>
    </>}
  </section>;
}
