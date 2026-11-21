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
        CAN OS can use information you already provided about your Site, its story,
        community, intended Programs and audiences to prepare editable website
        copy and related marketing materials.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        You review and edit the content before it is shared or published.
        You can change this decision later.
      </p>
    </div>
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold">May CAN OS reuse this information to prepare content?</legend>
      <label className={"flex cursor-pointer items-start gap-3 border p-4 "+(value==="granted"?"border-primary bg-primary/5":"border-border")}>
        <input className="mt-1 size-4 accent-primary" type="radio" name="website-content-reuse"
          checked={value==="granted"} onChange={()=>onChange("granted")} />
        <span className="space-y-1">
          <span className="block font-semibold">Yes, use my information</span>
          <span className="block text-sm text-muted-foreground">
            Prepare editable website copy from eligible Site information. Reuse the
            authorized information to suggest related marketing package content.
          </span>
        </span>
      </label>
      <label className={"flex cursor-pointer items-start gap-3 border p-4 "+(value==="denied"?"border-primary bg-primary/5":"border-border")}>
        <input className="mt-1 size-4 accent-primary" type="radio" name="website-content-reuse"
          checked={value==="denied"} onChange={()=>onChange("denied")} />
        <span className="space-y-1">
          <span className="block font-semibold">No, I'll write my own content</span>
          <span className="block text-sm text-muted-foreground">
            Start with a blank editorial content page. Do not derive website or
            marketing copy from information previously collected during setup.
          </span>
        </span>
      </label>
    </fieldset>
    {value==="unselected"&&<WorkspaceNotice tone="attention">
      Choose an option before continuing to Your Content.
    </WorkspaceNotice>}
    {value==="denied"&&hasSavedContent&&<WorkspaceNotice tone="attention">
      Selecting No clears the current editable website copy so that Step 5
      starts blank. Previously saved and published revisions remain in history
      until you explicitly replace them with a new saved revision.
    </WorkspaceNotice>}
    <p className="text-xs leading-5 text-muted-foreground">
      Site-level reuse consent does not grant permission to publish an individual
      person's biography, identifiable photograph or private learner information.
      Those require their own review and permissions. Official publication and
      enrollment authorization remain separate.
    </p>
  </section>;
}
