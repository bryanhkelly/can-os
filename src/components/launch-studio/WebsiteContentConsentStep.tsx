import { WorkspaceNotice } from "@/components/workspace";
import type { WebsiteContentReuseConsent } from "@/domain/site-local-content";

/** Consent governs reuse of previously entered Site facts for new editorial and marketing copy.
 * It is not a publication permission for people, photographs or protected records. */
export function WebsiteContentConsentStep({
  value, onChange, disabled, hasSavedContent,
}:{
  value:WebsiteContentReuseConsent;
  onChange:(choice:"granted"|"denied")=>void;
  disabled:boolean;
  hasSavedContent:boolean;
}){
  return <section className="space-y-5" aria-labelledby="website-consent-title">
    <div>
      <h3 id="website-consent-title" className="font-serif text-2xl">Build on what you've shared</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        We can use what you've shared about your organization, story, programs,
        and community to suggest website and outreach wording you can edit.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        You review and edit the content before it is shared or published.
        You can change this decision later.
      </p>
    </div>
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold">May we use what you've shared to suggest content?</legend>
      <label className={"flex cursor-pointer items-start gap-3 border p-4 "+(value==="granted"?"border-primary bg-primary/5":"border-border")}>
        <input className="mt-1 size-4 accent-primary" type="radio" name="website-content-reuse"
          checked={value==="granted"} onChange={()=>onChange("granted")} />
        <span className="space-y-1">
          <span className="block font-semibold">Yes, use my information</span>
          <span className="block text-sm text-muted-foreground">
            Use the information I've shared to suggest website and outreach text I can review.
          </span>
        </span>
      </label>
      <label className={"flex cursor-pointer items-start gap-3 border p-4 "+(value==="denied"?"border-primary bg-primary/5":"border-border")}>
        <input className="mt-1 size-4 accent-primary" type="radio" name="website-content-reuse"
          checked={value==="denied"} onChange={()=>onChange("denied")} />
        <span className="space-y-1">
          <span className="block font-semibold">No, I'll write my own content</span>
          <span className="block text-sm text-muted-foreground">
            Start with a blank page and write my own website and outreach content.
          </span>
        </span>
      </label>
    </fieldset>
    {value==="unselected"&&<WorkspaceNotice tone="attention">
      Choose an option before continuing to Your Content.
    </WorkspaceNotice>}
    {value==="denied"&&hasSavedContent&&<WorkspaceNotice tone="attention">
      Choosing No clears the text in your current website draft. Earlier saved
      versions will still be available.
    </WorkspaceNotice>}
    <p className="text-xs leading-5 text-muted-foreground">
      You still need permission to publish someone's photo, biography, or personal
      details. Website publication and program registration have their own reviews.
    </p>
  </section>;
}
