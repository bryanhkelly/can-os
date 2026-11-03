import type { LaunchJurisdictionResearch } from "@/domain/jurisdiction-launch-research";

const phaseLabels: Record<string,string> = {
  before_opening:"Before opening", before_enrollment:"Before enrollment", follow_up:"Follow-up",
};
const partyLabels: Record<string,string> = {can:"CAN",church:"Host church",family:"Family"};

export function JurisdictionLaunchResearch({
  research,
}: {research:LaunchJurisdictionResearch | undefined}) {
  if(!research) return (
    <div className="mt-3 rounded-lg border border-border/70 p-3 text-sm">
      <p className="font-medium">No source-backed research preview is available yet.</p>
      <p className="mt-1 text-muted-foreground">You can prepare the school, but CAN must review this jurisdiction and the proposed school model before any opening decision.</p>
    </div>
  );
  const verified = research.guidanceStatus==="verified_guidance";
  return <div className="mt-3 space-y-4 text-sm">
    <p className="font-semibold">{verified?"Independently verified state guidance":"Research preview — not approved policy"}</p>
    <p className="text-xs text-muted-foreground">Version {research.revision} · {verified?"Published guidance":research.reviewStatus.replaceAll("_"," ")}. {verified?"Operating approval is still school-specific.":"This draft may contain incomplete or outdated legal information and cannot clear readiness, create mandatory tasks, or establish eligibility."}</p>
    <p className="leading-6">{research.summary}</p>
    <div>
      <h4 className="font-semibold">Potential education funding</h4>
      {research.fundingPrograms.length===0?<p className="mt-1 text-muted-foreground">No researched funding pathway has been recorded yet.</p>:
        <ul className="mt-2 space-y-3">{research.fundingPrograms.map(program=><li key={program.id} className="rounded-lg border border-border/70 p-3">
          <p className="font-medium">{program.name}</p>
          <p className="mt-1">{program.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">Research status: {program.eligibilityStatus.replaceAll("_"," ")}. Funding does not imply approval for CAN or this location.</p>
          {program.sources.map(source=><p key={source.url} className="mt-1"><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} (official source)</a></p>)}
        </li>)}</ul>}
    </div>
    <div>
      <h4 className="font-semibold">{verified?"Source-backed requirements to review":"Preliminary legal and launch questions"}</h4>
      <p className="mt-1 text-xs text-muted-foreground">These are informational candidates, not an automatically approved or complete checklist. CAN's separate jurisdiction review determines applicability for the actual site and operating model.</p>
      {research.investigationItems.length===0?<p className="mt-1 text-muted-foreground">No audience-approved research items have been recorded.</p>:
        <ul className="mt-2 space-y-3">{research.investigationItems.map(item=><li key={item.id} className="rounded-lg border border-border/70 p-3">
          <p className="font-medium">{item.title}</p>
          <p className="mt-1">{item.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">Potential owner: {partyLabels[item.responsibleParty]} · Phase: {phaseLabels[item.phase]}</p>
          {item.sources.map(source=><p key={source.url} className="mt-1"><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}
        </li>)}</ul>}
    </div>
    {research.sources.length>0&&<details>
      <summary className="cursor-pointer font-medium">Research sources ({research.sources.length})</summary>
      <ul className="mt-2 space-y-1">{research.sources.map(source=><li key={source.url}>
        <a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        <span className="text-xs text-muted-foreground"> · {source.authority} · checked {new Date(source.checkedAt).toLocaleDateString()}</span>
      </li>)}</ul>
    </details>}
    <p className="text-xs text-muted-foreground">Saving setup choices does not authorize opening, enrollment, accreditation, scholarship participation, or a provider relationship.</p>
  </div>;
}
