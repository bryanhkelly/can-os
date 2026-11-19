import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { SiteLocalImage, SiteLocalImageConsent } from "@/domain/site-local-content";

/** One canonical website artwork control for a logo or site-owned hero image. */
export function WebsiteArtworkField({ field, value, disabled, onSelect, onChange }: {
  field: "heroImage" | "logoImage"; value: SiteLocalImage | null; disabled: boolean;
  onSelect: (event: ChangeEvent<HTMLInputElement>, field: "heroImage" | "logoImage") => void;
  onChange: (next: SiteLocalImage | null) => void;
}) {
  const label = field === "logoImage" ? "Site logo (optional)" : "Site artwork (optional)";
  return <fieldset disabled={disabled} className="space-y-3 border p-4">
    <legend className="px-2 text-sm font-semibold">{label}</legend>
    <Label className="block text-sm">
      <span className="mt-1 block text-xs text-muted-foreground">
        PNG or JPEG, re-encoded to a metadata-free PNG. No remote URLs or embeds.
      </span>
      <Input type="file" accept="image/png,image/jpeg" onChange={event=>onSelect(event,field)}
        aria-label={`Choose ${label.toLowerCase()}`} className="mt-3 block w-full text-sm"/>
    </Label>
    {value && <div className="space-y-3 border bg-muted/30 p-3">
      <img src={value.dataUrl} alt={field === "logoImage" ? "Selected logo preview" : "Selected artwork preview"}
        className="h-52 w-full object-contain"/>
      <Label className="block text-sm">
        <span className="font-medium">Artwork description for screen readers</span>
        <Input type="text" maxLength={180} value={value.altText}
          onChange={event=>onChange({...value,altText:event.target.value})}
          className="mt-2 w-full border bg-background p-2 text-sm"/>
      </Label>
      <Label className="flex items-start gap-2 text-sm">
        <Checkbox checked={value.rightsConfirmed} onChange={event=>onChange({...value,rightsConfirmed:event.target.checked})} className="mt-1"/>
        <span>I own this image or have documented permission to use it on the website and in Site communications.</span>
      </Label>
      <Label className="block text-sm">
        <span className="font-medium">Child privacy and consent</span>
        <Select value={value.childImageConsent}
          onChange={event=>onChange({...value,childImageConsent:event.target.value as SiteLocalImageConsent})}
          className="mt-2 w-full border bg-background p-2 text-sm">
          <option value="unconfirmed">Choose a confirmation</option>
          <option value="no_identifiable_children">No identifiable children appear</option>
          <option value="guardian_consent_confirmed">Documented guardian consent covers every identifiable child</option>
        </Select>
      </Label>
      <Button type="button" variant="outline" onClick={()=>onChange(null)} className="min-h-11 border px-3 text-xs">
        Remove {field === "logoImage" ? "logo" : "artwork"}
      </Button>
    </div>}
  </fieldset>;
}
