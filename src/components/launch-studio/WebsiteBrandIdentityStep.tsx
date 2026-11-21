import { SelectionCard } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { siteBrandDirections, type SiteBrandDirectionId } from "@/domain/site-brand-direction";

/** Presentation only. Brand source, permission checks and immutable saves
 * stay with the canonical Website & Brand controller/server command. */
export function WebsiteBrandIdentityStep({
  displayName,storyRevision,currentRevision,canEdit,busy,
  direction,recommendation,onDisplayNameChange,onDirectionChange,
}:{
  displayName:string;storyRevision:string|null;currentRevision:number;
  canEdit:boolean;busy:boolean;
  direction:SiteBrandDirectionId|null;recommendation:SiteBrandDirectionId|null;
  onDisplayNameChange:(name:string)=>void;
  onDirectionChange:(direction:SiteBrandDirectionId)=>void;
}){
  return <section aria-label="Brand Identity" className="space-y-5">
    <div>
      <h3 className="font-serif text-2xl font-semibold">What should families feel about your Site?</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Choose an editorial direction. Saved Site Information can inform a suggestion, but this
        choice never verifies Programs, staff or academic outcomes.
      </p>
      {storyRevision
        ? <p className="mt-2 text-xs text-muted-foreground">
            Saved Site Information: {new Date(storyRevision).toLocaleDateString()}
          </p>
        : <p className="mt-2 text-xs text-muted-foreground">
            No optional Purpose &amp; Story answers saved yet. You can still choose a direction.
          </p>}
    </div>
    <Field label="Public-facing Site name" description="The name belongs to the saved Brand version.
      Changing Site Profile later does not rewrite older released materials.">
      <Input type="text" maxLength={120} value={displayName} disabled={busy||!canEdit}
        onChange={event=>onDisplayNameChange(event.target.value)}
        placeholder="Your learning community name" className="min-h-11 w-full"/>
    </Field>
    <div className="border bg-muted/20 p-3 text-sm">
      <p className="font-semibold">{currentRevision>0
        ? `Current saved Site Brand: v${currentRevision}`
        : "Site Brand not saved yet"}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Brand edits create immutable versions. Existing materials retain their appearance
        until you deliberately update and regenerate them.
      </p>
    </div>
    <fieldset disabled={busy||!canEdit}>
      <legend className="text-sm font-semibold">Choose your brand direction</legend>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {siteBrandDirections.map(option=>{
          const selected=direction===option.id;
          return <SelectionCard key={option.id} kind="radio" name="site-brand-direction"
            value={option.id} checked={selected}
            onChange={checked=>{if(checked) onDirectionChange(option.id);}}
            title={option.name}
            detail={<>
              <span className="block">{option.character}</span>
              <span className="mt-1 block">{option.description}</span>
              {(selected||recommendation===option.id)&&<span className="mt-2 block font-semibold text-primary">
                {selected?"Selected":""}{selected&&recommendation===option.id?" · ":""}
                {recommendation===option.id?"Suggested from Site Information":""}
              </span>}
            </>}
            className="h-full min-h-28" />;
        })}
      </div>
    </fieldset>
    <p className="text-xs text-muted-foreground">{recommendation
      ?"A keyword recommendation is not verified institutional evidence."
      :"No recommendation appears without matching Story context."}</p>
    <p className="text-xs text-muted-foreground">
      Saving creates a new Brand version only when its properties change.
      Website layout and copy remain independent.
    </p>
  </section>;
}
