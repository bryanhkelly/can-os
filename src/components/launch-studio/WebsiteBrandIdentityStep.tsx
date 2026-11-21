import { SelectionCard } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { siteBrandDirections, type SiteBrandDirectionId } from "@/domain/site-brand-direction";

/** Presentation only. Brand source, permission checks and immutable saves
 * stay with the canonical Website & Brand controller/server command. */
export function WebsiteBrandIdentityStep({
  displayName,currentRevision,canEdit,busy,
  direction,recommendation,onDisplayNameChange,onDirectionChange,
}:{
  displayName:string;currentRevision:number;
  canEdit:boolean;busy:boolean;
  direction:SiteBrandDirectionId|null;recommendation:SiteBrandDirectionId|null;
  onDisplayNameChange:(name:string)=>void;
  onDirectionChange:(direction:SiteBrandDirectionId)=>void;
}){
  return <section aria-label="Brand Identity" className="space-y-5">
    <div>
      <h3 className="font-serif text-2xl font-semibold">How do you want people to feel when they discover your community?</h3>
      <p className="mt-2 text-sm text-muted-foreground">Choose a visual direction that reflects the community you want to create.</p>
    </div>
    <Field label="Name visitors will see">
      <Input type="text" maxLength={120} value={displayName} disabled={busy||!canEdit}
        onChange={event=>onDisplayNameChange(event.target.value)}
        placeholder="Your Site or community name" className="min-h-11 w-full"/>
    </Field>
    <p className="text-sm text-muted-foreground">{currentRevision>0?"Saved":"Not saved yet"}</p>
    <fieldset disabled={busy||!canEdit}>
      <legend className="text-sm font-semibold">Choose a style</legend>
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
                {recommendation===option.id?"Suggested":""}
              </span>}
            </>}
            className="h-full min-h-28" />;
        })}
      </div>
    </fieldset>

  </section>;
}
