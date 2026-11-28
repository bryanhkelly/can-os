import { Label } from "@/components/ui/label";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import {
  siteLocalImageMaxBytes, validateInlinePng,
  type SiteLeader,type SiteLocalContent,
} from "@/domain/site-local-content";

/** One Site-owned editable Leadership page; no second CMS, LinkedIn scraper,
 * unconsented contact import or independent publication authority. */
export function WebsiteLeadershipEditor({content,setContent,disabled}:{
  content:SiteLocalContent;
  setContent:Dispatch<SetStateAction<SiteLocalContent>>;
  disabled:boolean;
}) {
  const people=content.leadershipMembers??[];
  const [error,setError]=useState("");
  const update=(id:string,patch:Partial<SiteLeader>)=>
    setContent(old=>({...old,leadershipMembers:(old.leadershipMembers??[])
      .map(person=>person.id===id?{...person,...patch}:person)}));
  const add=()=>{
    if(people.length>=16)return;
    setContent(old=>({...old,leadershipMembers:[...(old.leadershipMembers??[]),{
      id:crypto.randomUUID(),name:"",title:"",biography:"",consentConfirmed:false,
    }]}));
  };
  const upload=async(person:SiteLeader,file:File|null)=>{
    if(!file)return;
    setError("");
    try {
      if(file.type!=="image/png"||file.size>siteLocalImageMaxBytes||file.size<45)
        throw new Error("Portraits must be PNG files smaller than 160 KB.");
      const buffer=new Uint8Array(await file.arrayBuffer());
      // PNG is validated before it enters the same Site-content save workflow.
      let text="";
      for(let i=0;i<buffer.length;i++)text+=String.fromCharCode(buffer[i]!);
      const dataUrl="data:image/png;base64,"+btoa(text);
      validateInlinePng(dataUrl);
      update(person.id,{photo:{
        dataUrl,altText:"Portrait of "+person.name,
        rightsConfirmed:false,childImageConsent:"no_identifiable_children",
      }});
    }catch(failure){setError(failure instanceof Error?failure.message:"Portrait could not be read.");}
  };
  return <details className="border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Leadership page (optional)</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Publish people, titles, short biographies, approved portraits and LinkedIn
        profile links as a distinct Leadership page. The page appears only when
        at least one person has permission to be displayed. You can use information
        a leader provides from LinkedIn, but CAN OS does not scrape profiles or
        automatically copy third-party information. Review it before saving.
      </p>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {people.map((person,index)=><section key={person.id}
        className="space-y-3 border border-border p-3"
        aria-label={"Leader "+(index+1)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-semibold">Leader {index+1}</h4>
          <Button type="button" size="sm" variant="outline" disabled={disabled}
            onClick={()=>setContent(old=>({...old,
              leadershipMembers:(old.leadershipMembers??[]).filter(item=>item.id!==person.id)}))}>
            Remove
          </Button>
        </div>
        <Label className="block space-y-1 text-sm font-medium">
          Full name
          <Input required maxLength={120} disabled={disabled} value={person.name}
            onChange={event=>update(person.id,{name:event.target.value})}/>
        </Label>
        <Label className="block space-y-1 text-sm font-medium">
          Role or title
          <Input required maxLength={120} disabled={disabled} value={person.title}
            onChange={event=>update(person.id,{title:event.target.value})}/>
        </Label>
        <Label className="block space-y-1 text-sm font-medium">
          Short biography
          <Textarea rows={4} maxLength={1600} disabled={disabled} value={person.biography}
            onChange={event=>update(person.id,{biography:event.target.value})}/>
        </Label>
        <Label className="block space-y-1 text-sm font-medium">
          LinkedIn profile URL (optional)
          <Input inputMode="url" placeholder="https://www.linkedin.com/in/profile"
            maxLength={240} disabled={disabled} value={person.linkedinUrl??""}
            onChange={event=>update(person.id,{linkedinUrl:event.target.value})}/>
          <span className="block text-xs font-normal text-muted-foreground">
            Link to an authorized personal profile. No automatic LinkedIn retrieval.
          </span>
        </Label>
        <Label className="block space-y-1 text-sm font-medium">
          Portrait PNG (optional; max 160 KB)
          <Input type="file" accept="image/png" disabled={disabled}
            className="w-full" onChange={event=>
              void upload(person,event.target.files?.[0]??null)}/>
        </Label>
        {person.photo&&<div className="space-y-2">
          <p className="text-xs text-muted-foreground">Portrait selected</p>
          <Label className="block space-y-1 text-sm font-medium">
            Image description
            <Input maxLength={180} disabled={disabled} value={person.photo.altText}
              onChange={event=>update(person.id,{photo:{...person.photo!,altText:event.target.value}})}/>
          </Label>
          <Label className="flex items-center gap-2 text-sm">
            <Checkbox disabled={disabled} checked={person.photo.rightsConfirmed}
              onChange={event=>update(person.id,{photo:{
                ...person.photo!,rightsConfirmed:event.target.checked,
              }})}/>
            <span>I have permission to display this portrait</span>
          </Label>
          <Button variant="outline" size="sm" type="button" disabled={disabled}
            onClick={()=>update(person.id,{photo:null})}>Remove portrait</Button>
        </div>}
        <Label className="flex items-center gap-2 text-sm">
          <Checkbox disabled={disabled} checked={person.consentConfirmed}
            onChange={event=>update(person.id,{consentConfirmed:event.target.checked})}/>
          <span>Permission to publish this person's name, title, biography and profile link is confirmed</span>
        </Label>
      </section>)}
      <Button type="button" variant="outline" disabled={disabled||people.length>=16}
        onClick={add}>Add a leader</Button>
    </div>
  </details>;
}
