import type { SiteTemplateId } from "@/domain/site-theme";
import type { PublicSitePath } from "@/domain/public-site-paths";
import {
  websiteChromeSources, websiteTemplatePageSources,
  websiteTemplatePresentationNotes, type WebsiteElementSource,
} from "@/domain/website-template-source-map";

const fieldSourceNames:Record<WebsiteElementSource["kind"],string>={
  "site-identity":"Saved identity",
  "site-copy":"Editable website copy",
  "site-story":"Optional Site Story suggestion",
  "site-media":"Reviewed Site imagery",
  "approved-records":"Approved data",
  "site-layout":"Editable section configuration",
  "template-copy":"Fixed template text",
  "computed":"Computed from eligibility",
};

function ProvenanceRows({items}:{items:readonly WebsiteElementSource[]}) {
  return <div className="divide-y divide-border" role="list">
    {items.map((item,index)=><div key={item.element+"-"+index} role="listitem"
      className="grid gap-x-5 gap-y-1 py-3 text-xs sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.8fr)]">
      <div>
        <p className="font-semibold text-foreground">{item.element}</p>
        <p className="mt-1 text-muted-foreground">{fieldSourceNames[item.kind]}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p><span className="font-semibold">Data source:</span> {item.source}</p>
        <p className="leading-5 text-muted-foreground">{item.details}</p>
        <p className="leading-5"><span className="font-semibold">Where it changes:</span> {item.editAt}</p>
      </div>
    </div>)}
  </div>;
}

/** Information for Site administrators, never injected into the Site HTML.
 * Layout sequence derives from composePublicSiteHome, so switching templates
 * also reorders the editable provenance guide without duplicating layout rules.
 */
export function WebsiteTemplateSourceGuide({
  template, page,
}: {template:SiteTemplateId;page:PublicSitePath}) {
  const notes=websiteTemplatePresentationNotes[template];
  const sections=websiteTemplatePageSources(template,page);
  return <section aria-label="Website section and data source guide"
    className="mt-5 min-w-0 space-y-4 border border-border bg-card p-4">
    <div>
      <h4 className="text-sm font-semibold">Section guide: content and sources</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        This map describes the actual website renderer for the selected template and page.
        The gallery uses fictional examples to demonstrate layout. Your saved Site,
        Brand, website copy and independently approved listings replace those examples
        on the real Site. Nothing here is added as text to the website itself.
      </p>
    </div>
    <div className="border border-border bg-muted/20 p-3 text-xs leading-5">
      <p><span className="font-semibold">Section arrangement:</span> {notes.layout}</p>
      <p className="mt-2"><span className="font-semibold">Header and decorative text:</span> {notes.chrome}</p>
      <p className="mt-2"><span className="font-semibold">Hero treatment:</span> {notes.hero}</p>
      <p className="mt-2 text-muted-foreground">
        Section presence depends on saved copy and publication eligibility.
        Items below describe potential elements, not a guarantee that every one
        appears in an unapproved Site preview.
      </p>
    </div>
    <details className="border border-border" open>
      <summary className="cursor-pointer p-3 text-sm font-semibold">
        Header, navigation, identity and footer
        <span className="ml-2 font-normal text-muted-foreground">
          ({websiteChromeSources.length} elements)
        </span>
      </summary>
      <div className="border-t border-border px-3">
        <ProvenanceRows items={websiteChromeSources}/>
      </div>
    </details>
    <h5 className="text-sm font-semibold">Page sections, in displayed layout order</h5>
    <div className="space-y-2">
      {sections.map((section,index)=><details key={section.key}
        className="min-w-0 border border-border" open={index===0 ? true : undefined}>
        <summary className="cursor-pointer p-3 text-sm font-semibold">
          <span className="mr-2 font-mono text-xs text-muted-foreground">
            {String(index+1).padStart(2,"0")}
          </span>
          {section.title}
          <span className="ml-2 font-normal text-muted-foreground">
            ({section.elements.length} elements)
          </span>
        </summary>
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
          <p className="text-xs leading-5">{section.description}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">When shown:</span> {section.appearsWhen}
          </p>
          <ProvenanceRows items={section.elements}/>
        </div>
      </details>)}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">
      Source rules apply across all seven layouts. A saved Brand name is displayed
      exactly as entered. Fixed editorial headings stay identified as template copy.
      Draft setup details, unverified affiliations and private learner records never
      become public Site text through this guide.
    </p>
  </section>;
}
