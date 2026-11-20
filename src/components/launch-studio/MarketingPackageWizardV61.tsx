import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuidedSetupProgress } from "@/components/workflow/guided-setup-shell";
import { Textarea } from "@/components/ui/textarea";
import { ActionFooter, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  marketingAudienceOptions, marketingFormatOptions, marketingPurposeOptions, marketingPackageSteps,
  type MarketingFormat, type MarketingPackageContent,
} from "@/domain/marketing-package-v61";
import type { readSiteMarketingSuggestionsV61 } from "@/modules/programs/site-marketing-packages-v61.functions";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";

type MarketingSuggestions=Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>>;
type MarketingSuggestion=MarketingSuggestions[MarketingPackageContent["purpose"]];
const stepLabels=["Menu","Audience","Messages","Collateral & Assets"] as const;

/** Controlled, reusable Introduce authoring flow. Package persistence and Brand
 * versions belong to the parent controller and shared server-side services. */
export function MarketingPackageWizardV61({
  siteId,step,title,content,busy,brandVersionId,currentSuggestion,purposeOptions,
  activePreviewFormat,starter,onTitleChange,onPatch,onPreviewFormatChange,
  onBack,onSaveExit,onNext,hasSavedPackage,
}:{
  siteId:string;step:number;title:string;content:MarketingPackageContent;busy:boolean;
  brandVersionId:string|null;currentSuggestion:MarketingSuggestion|null;
  purposeOptions:ReadonlyArray<(typeof marketingPurposeOptions)[number]>;
  activePreviewFormat:MarketingFormat|null;
  starter:(purpose:MarketingPackageContent["purpose"])=>MarketingPackageContent;
  onTitleChange:(value:string)=>void;
  onPatch:(value:Partial<MarketingPackageContent>)=>void;
  onPreviewFormatChange:(format:MarketingFormat)=>void;
  onBack:()=>void;onSaveExit:()=>void;onNext:()=>void;hasSavedPackage:boolean;
}){
  return <>

        <GuidedSetupProgress label="Package progress" steps={marketingPackageSteps.map((id, index) => ({
          id, title: stepLabels[index], status: index === step ? "current" as const : "upcoming" as const,
        }))} />

        {step===0&&<WorkspacePanel title="What would you like to share?" description="Choose a starting point. Your Site brand will be reused automatically later.">
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Package purpose</legend>
            {purposeOptions.map(option=><label key={option.id}
              className={"flex cursor-pointer gap-3 border p-4 text-sm "+
                (content.purpose===option.id?"border-primary bg-accent":"bg-card")}>
              <Radio name="package-purpose" className="mt-1"
                checked={content.purpose===option.id} onChange={()=>
                  onPatch({...starter(option.id),audiences:content.audiences,formats:content.formats})}/>
              <span><strong>{option.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{option.description}</span></span>
            </label>)}
          </fieldset>
          <div className="mt-5"><Field label="Package name" required>
            <Input value={title} maxLength={120} onChange={event=>onTitleChange(event.target.value)}/>
          </Field></div>
        </WorkspacePanel>}

        {step===1&&<WorkspacePanel title="Who do you want to reach?" description="Select your intended audiences. This does not add contacts or authorize emails.">
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Intended audiences</legend>
            {marketingAudienceOptions.map(option=><label key={option.id}
              className="flex min-h-11 items-center gap-3 border bg-card p-3 text-sm">
              <Checkbox checked={content.audiences.includes(option.id)}
                onChange={event=>onPatch({audiences:event.target.checked
                  ? [...new Set([...content.audiences,option.id])]
                  : content.audiences.filter(id=>id!==option.id)})}/>
              {option.label}
            </label>)}
          </fieldset>
          <div className="mt-5"><Field label="Geographic focus (optional)">
            <Input maxLength={120} value={content.geography} placeholder="Your community or neighborhood"
              onChange={event=>onPatch({geography:event.target.value})}/>
          </Field></div>
        </WorkspacePanel>}

        {step===2&&<WorkspacePanel title="Your message"
          description="Start with your Site's saved vision and learning interests. Review each suggestion before sharing it.">
          {currentSuggestion&&<div className="mt-4 space-y-3 border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Built from what you already shared</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {currentSuggestion.sources.length
                ? currentSuggestion.sources.join(" · ")
                : "No saved Site Story or program interests yet. Start with this editable introduction."}
              {" "}These are proposed plans, not verified offerings or enrollment claims.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={()=>onPatch({
                  headline:starter(content.purpose).headline,
                  message:starter(content.purpose).message,
                  callToAction:starter(content.purpose).callToAction,
                })}>Restore suggested message</Button>
              {currentSuggestion.websiteAlternative&&<Button type="button" size="sm"
                variant="outline" disabled={busy}
                onClick={()=>{
                  const alternative=currentSuggestion.websiteAlternative;
                  if(alternative)onPatch({
                    headline:alternative.headline||content.headline,
                    message:alternative.message,
                  });
                }}>Use saved website wording</Button>}
            </div>
            {currentSuggestion.websiteAlternative&&<p className="text-xs leading-5 text-muted-foreground">
              Website wording is a separate suggestion and never overwrites your edits automatically.
              Review any private planning details before generating materials.
            </p>}
          </div>}
          <div className="mt-4 space-y-5">
            <Field label="Headline" required><Input maxLength={160} value={content.headline}
              onChange={event=>onPatch({headline:event.target.value})}/></Field>
            <Field label="Your message" required><Textarea rows={7} maxLength={1600}
              value={content.message} onChange={event=>onPatch({message:event.target.value})}/></Field>
            <Field label="Call to action"><Input maxLength={100} value={content.callToAction}
              onChange={event=>onPatch({callToAction:event.target.value})}/></Field>
          </div>
        </WorkspacePanel>}

        {step===3&&<WorkspacePanel title="Choose and preview your materials"
          description="Your saved Site Brand is applied automatically. Review the real layout for each format before saving the package.">
          <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold">Available formats</legend>
              <p className="text-xs leading-5 text-muted-foreground">
                Select the materials you need, then preview each one.
              </p>
              {marketingFormatOptions.map(option=>{
                const selected=content.formats.includes(option.id);
                return <div key={option.id} className={"flex min-w-0 flex-wrap items-start gap-2 border p-3 "+
                  (selected?"border-primary/60 bg-accent/25":"border-border bg-card")}>
                  <Checkbox id={"marketing-format-"+option.id} className="mt-1"
                    checked={selected}
                    onChange={event=>{
                      onPatch({formats:event.target.checked
                        ? [...new Set([...content.formats,option.id])]
                        : content.formats.filter(id=>id!==option.id)});
                      if(event.target.checked)onPreviewFormatChange(option.id);
                    }}/>
                  <Label htmlFor={"marketing-format-"+option.id}
                    className="min-w-0 flex-1 cursor-pointer text-sm">
                    <strong className="block">{option.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </Label>
                  <Button type="button" size="sm" variant="outline" disabled={!selected}
                    aria-pressed={activePreviewFormat===option.id}
                    onClick={()=>onPreviewFormatChange(option.id)}>Preview</Button>
                </div>;
              })}
            </fieldset>
            <div className="min-w-0">
              {activePreviewFormat
                ? <MarketingMaterialPreviewV61
                    siteId={siteId}
                    title={title}
                    brandVersionId={brandVersionId}
                    format={activePreviewFormat}
                    content={content}/>
                : <div className="flex min-h-72 items-center justify-center border bg-muted/25 p-6">
                    <p className="text-center text-sm text-muted-foreground">
                      Select a material format to preview your design.
                    </p>
                  </div>}
            </div>
          </div>
          <div className="mt-4"><WorkspaceNotice tone="info">
            This is a private working preview, not a public release.
            Graphic layouts use a shortened excerpt if the message is long. The full copy stays in your package.
            Save your package to generate immutable, downloadable materials; email sending is separate.
          </WorkspaceNotice></div>
        </WorkspacePanel>}

        <ActionFooter>
          <Button variant="outline" disabled={busy} onClick={()=>onBack()}>
            <ArrowLeft aria-hidden="true"/> {step===0?"Cancel":"Back"}
          </Button>
          {hasSavedPackage&&<Button variant="outline" disabled={busy} onClick={()=>onSaveExit()}>Save &amp; Exit</Button>}
          <Button disabled={busy} onClick={()=>onNext()}>
            {busy?"Saving…":step===3?"Save package":"Save & Continue"}
            {step===3?<Check aria-hidden="true"/>:<ArrowRight aria-hidden="true"/>}
          </Button>
        </ActionFooter>
      
  </>;
}
