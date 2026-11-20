import type { getPartnerWebsitePreviewView } from "@/modules/sites/site-website-preview.functions";
import { StatusBadge, WorkspacePanel, type StatusTone } from "@/components/workspace";

/** Site website review is a shared presentation layer; publication remains governed
 * by the canonical site-website services, not by these components.
 */
export function WebsiteInformationChecklist({ data }: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>
}) {
  const readiness = data.publicInformationReadiness;
  const required = readiness.gaps.filter(gap => gap.required);
  const optional = readiness.gaps.filter(gap => !gap.required);
  return <section aria-labelledby="website-readiness-title"
    className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parent information</p>
    <h2 id="website-readiness-title" className="mt-2 font-serif text-2xl font-semibold">
      What families can learn about this Site
    </h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      This checklist is derived from approved public Site records and published local
      content—not from draft copy or invented example data. It does not establish
      school-opening authority, admissions approval, or live website hosting.
    </p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className=" border p-3 text-sm">
        <p className="font-semibold">Website marketing</p>
        <p className="mt-1 text-muted-foreground">{readiness.marketing === "published"
          ? "Published in the Site registry; public host still needs verification"
          : "Not published"}</p>
      </div>
      <div className=" border p-3 text-sm">
        <p className="font-semibold">Information</p>
        <p className="mt-1 text-muted-foreground">{required.length === 0
          ? "Required parent information categories represented"
          : `${required.length} required information gaps`}</p>
      </div>
      <div className=" border p-3 text-sm">
        <p className="font-semibold">Institutional authority</p>
        <p className="mt-1 text-muted-foreground">Not verified by this preview</p>
      </div>
    </div>
    {readiness.gaps.length ? <div className="mt-5 space-y-5">
      {[{label:"Needs approval or configuration", gaps:required},
        {label:"Additional information families value", gaps:optional}]
        .filter(group => group.gaps.length).map(group =>
          <div key={group.label}>
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <ul className="mt-2 divide-y  border">
              {group.gaps.map(gap => <li key={`${gap.category}:${gap.owner}:${gap.message}`}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm">
                <span className="max-w-2xl">{gap.message}</span>
                <span className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                  <span>Owner: {gap.owner.replace(/_/g, " ")}</span>
                  <a className="font-semibold underline underline-offset-4" href={gap.destination}>
                    Open owning workspace
                  </a>
                </span>
              </li>)}
            </ul>
          </div>)}
    </div> : <p role="status" className="mt-4 text-sm">
      All represented information categories have reviewed public values. This does
      not certify Site opening or external hosting.
    </p>}
  </section>;
}

/** An authorized Site editor can reconcile Launch and Settings values with the
 * independently reviewed fields actually eligible for the public website.
 * This is a read-only mapping, never an alternative publisher or CMS. */
export function WebsiteSourceMappingPanel({data}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
}) {
  const mapping = data.sourceMapping;
  const sitePublished = data.status === "published";
  type MappingRow = {label:string;source:string;status:string;tone:StatusTone;details:string};
  const approvalStatus = (review:typeof mapping.physicalAddressReview,publicVisible:boolean) =>
    publicVisible
      ? sitePublished ? "Reviewed and publicly eligible" : "Reviewed; Site publication pending"
      : review === "source_changed" ? "Changed since last review"
      : review === "expired" ? "Review expired"
      : review === "withdrawn" ? "Approval withdrawn"
      : review === "invalid_review" ? "Review needs correction"
      : review === "approved" ? "Reviewed; not displayed"
      : "Independent review required";
  const rows:MappingRow[] = [
    {label:"Site name and organization",source:"Canonical Site profile",
      status:sitePublished?"Site identity published":"Saved Site identity",
      tone:sitePublished?"success":"info",
      details:data.siteName+" · "+data.organizationName},
    {label:"Physical Site address",source:"Site profile · Location",
      status:mapping.physicalAddressSaved
        ? approvalStatus(mapping.physicalAddressReview,mapping.publicAddressVisible)
        : "No validated address saved",
      tone:mapping.publicAddressVisible?"success":mapping.physicalAddressSaved?"attention":"neutral",
      details:"A saved location never proves opening authority. Public display requires separate identity review."},
    {label:"Public contact information",source:"Site profile · Contact",
      status:mapping.contactSaved
        ? approvalStatus(mapping.contactReview,mapping.publicContactVisible)
        : "No public contact channel saved",
      tone:mapping.publicContactVisible?"success":mapping.contactSaved?"attention":"neutral",
      details:"Only a reviewed Site contact is eligible for publication. Private staff contact details are excluded."},
    {label:"Site and community context",source:"Launch · Site information",
      status:mapping.schoolContextSaved?"Saved for planning":"Not configured",
      tone:mapping.schoolContextSaved?"info":"neutral",
      details:"Site type, host church and reference website stay private; affiliations are not inferred from these fields."},
    {label:"Learning interests and delivery intent",source:"Launch · Learning preferences",
      status:mapping.learningIntentSaved?"Saved for private preview":"Not configured",
      tone:mapping.learningIntentSaved?"info":"neutral",
      details:"Proposed grades, delivery mode and program interests never become published offerings."},
    {label:"Academic programs",source:"Reviewed Program marketing",
      status:data.approvedAcademicCount
        ? data.approvedAcademicCount+" reviewed Program"+(data.approvedAcademicCount===1?"":"s")
        : "No approved academic listings",
      tone:data.approvedAcademicCount?"success":"neutral",
      details:"Grades, academic summaries, school-day schedules and Apply eligibility come from their separate approval services."},
    {label:"Website blocks and placement",source:"Site content channel configuration",
      status:mapping.contentChannelsPublished
        ? "Published configuration · revision "+mapping.contentChannelPublishedRevision
        : "Published blocks not configured",
      tone:mapping.contentChannelsPublished?"success":"neutral",
      details:"Private block revision "+mapping.contentChannelDraftRevision+
        ". Saving a private layout never publishes it. Live pages read only the published configuration."},
    {label:"Website theme, story and artwork",source:"Website & Brand Studio",
      status:data.currentRevision===0?"No saved website revision":
        "Latest revision "+data.currentRevision+" · "+(
          data.localContentStatus==="published"?"published":
          data.localContentStatus==="draft"?"private draft":"requires review"),
      tone:data.localContentStatus==="published"?"success":
        data.localContentStatus==="review_required"?"attention":"info",
      details:"Artwork requires verified usage rights and child consent. Published pages use the latest independently eligible copy, not a private draft."},
  ];
  return <WorkspacePanel title="Launch and configuration mapping"
    description="See where the website gets each fact and why some saved setup data is not public. This view never changes publication or approval.">
    <dl className="divide-y border border-border/70">
      {rows.map(row=><div key={row.label} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-5">
        <dt className="font-medium text-sm">{row.label}
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{row.source}</span>
        </dt>
        <dd className="min-w-0 space-y-2">
          <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
          <p className="text-sm leading-6 text-muted-foreground break-words">{row.details}</p>
        </dd>
      </div>)}
    </dl>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">A published website address, a saved brand revision, public hosting reachability, and eligibility to accept applications are separate verifications. Changes in Launch or Settings do not bypass review.</p>
  </WorkspacePanel>;
}

/** A shared quality guide for every partner school. This is advisory and
 * never substitutes for publisher, school opening, hosting, or consent checks. */
export function WebsiteDesignChecklist({data}:{data:Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>}) {
  const content=data.editingContent;
  const publishedPages=Object.keys(data.previewPages??{});
  const items=[
    {title:"A recognizable Site welcome",ready:Boolean(content?.welcomeMessage?.trim()),
      help:"Add a short, distinctive welcome in the local website editor."},
    {title:"Your Site's purpose and story",ready:Boolean(content?.schoolVision?.trim() &&
      (content?.localDescription?.trim() || content?.churchHistory?.trim())),
      help:"Describe why this learning community exists and the people and community behind it."},
    {title:"Reviewed Site photography",ready:data.approvedPhotoCount>0 || Boolean(content?.branding.heroImage?.rightsConfirmed &&
      content?.branding.heroImage?.altText?.trim() &&
      content?.branding.heroImage?.childImageConsent !== "unconfirmed"),
      help:"Add one rights-cleared photograph with accessible alt text; the layout works without a photo."},
    {title:"A complete About page",ready:publishedPages.includes("/about"),
      help:"Publish local identity content to make the About page available."},
    {title:"Published academic information",ready:data.approvedAcademicCount>0,
      help:"Academic Programs require separate institution-owned marketing approval."},
    {title:"Useful family next steps",ready:Boolean(publishedPages.includes("/admissions") ||
      publishedPages.includes("/contact")),
      help:"Families should have a published contact channel or an approved Program inquiry route."},
  ];
  const completed=items.filter(item=>item.ready).length;
  return <section aria-labelledby="school-website-design-readiness" className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website quality</p>
    <h2 id="school-website-design-readiness" className="mt-2 font-serif text-2xl font-semibold">Make this Site feel like your community</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      A compelling Site website combines your story and rights-cleared imagery with independently
      approved programs and family information. These checks apply across CAN OS Sites;
      they are editorial guidance, not a publication or operating authorization.
    </p>
    <p className="mt-3 text-sm font-semibold" role="status">{completed} of {items.length} content-quality signals represented</p>
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map(item=><li key={item.title} className=" border p-4">
        <p className="text-sm font-semibold">{item.ready?"✓ ":"○ "}{item.title}</p>
        {!item.ready&&<p className="mt-2 text-sm text-muted-foreground">{item.help}</p>}
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-muted-foreground">Draft media and copy require the existing publication and rights checks before appearing publicly. External hosting, applications and school opening are verified separately.</p>
  </section>;
}
