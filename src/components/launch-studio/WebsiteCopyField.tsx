import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteLocalContentLimits, websiteStarterFieldIds,
  type SiteLocalContent, type SiteLocalTextField, type WebsiteStarterField } from "@/domain/site-local-content";
import type { WebsiteStoryCandidate } from "@/domain/site-website-story-suggestions";

export type WebsiteCopyFieldSpec={
  key:SiteLocalTextField;label:string;help:string;multi:boolean;shownOn?:string;
};

/** Field editor with independently applied Site Story candidate and fixed original reset.
 * Does not know about persistence, publication or Site authorization. */
export function WebsiteCopyField({field,content,candidate,disabled,onChange,onRestore}:{
  field:WebsiteCopyFieldSpec;content:SiteLocalContent;candidate?:WebsiteStoryCandidate;
  disabled:boolean;onChange:(text:string)=>void;onRestore:()=>void;
}) {
  const starter=content.editorialBaseline?.fields[field.key as WebsiteStarterField];
  const changed=typeof starter==="string"&&(content[field.key]??"")!==starter;
  const index=websiteStarterFieldIds.indexOf(field.key as WebsiteStarterField);
  return <div className="border-b border-border pb-5 last:border-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <Label htmlFor={`website-copy-${field.key}`} className="min-w-0 flex-1 text-sm">
        <span className="flex items-center gap-3 font-semibold">
          {index>=0&&<span aria-hidden="true"
            className="font-mono text-xs font-normal text-muted-foreground">
            {String(index+1).padStart(2,"0")}
          </span>}
          {field.label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{field.help}</span>
        {field.shownOn&&<span className="mt-2 block text-xs leading-5">
          <strong>Shown on:</strong> {field.shownOn}

        </span>}
      </Label>
      {typeof starter==="string"&&<Button variant="outline" type="button"
        aria-label={`Reset ${field.label} to original suggested copy`}
        disabled={disabled||!changed} onClick={onRestore} className="min-h-11">
        Reset
      </Button>}
    </div>
    {field.multi
      ? <Textarea id={`website-copy-${field.key}`}
          rows={field.key==="statementOfFaith"?6:field.key==="heroHeadline"?2:4}
          maxLength={siteLocalContentLimits[field.key]} disabled={disabled}
          value={content[field.key]??""} onChange={event=>onChange(event.target.value)}
          className="mt-3 w-full border bg-background p-3 text-sm leading-6"/>
      : <Input id={`website-copy-${field.key}`} type="text"
          maxLength={siteLocalContentLimits[field.key]} disabled={disabled}
          value={content[field.key]??""} onChange={event=>onChange(event.target.value)}
          className="mt-3 min-h-11 w-full border bg-background p-3 text-sm"/>}
    {candidate&&<div className="mt-3 border bg-muted/20 p-3">
      <p className="text-xs font-semibold">Suggested text</p>
      <p className="mt-1 text-xs text-muted-foreground">{candidate.reason}</p>
      <p className="mt-1 text-2xs text-muted-foreground">Based on your Site Information.</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{candidate.text}</p>
      <Button variant="outline" type="button" className="mt-3 min-h-11"
        disabled={disabled||content[field.key]===candidate.text}
        onClick={()=>onChange(candidate.text)}>
        {content[field.key]===candidate.text?"Suggestion applied":"Apply suggestion"}
      </Button>
    </div>}

  </div>;
}
