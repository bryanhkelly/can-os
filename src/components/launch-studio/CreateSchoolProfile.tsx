import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";
import { useState, type FormEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { PageFrame, PageHeader } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createLaunchSite, type listLaunchOptions } from "@/modules/programs/launch.functions";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { usStatesAndTerritories } from "@/domain/site-setup-configuration";

export function CreateSchoolProfile({ options }: {options:Awaited<ReturnType<typeof listLaunchOptions>>}) {
  const router=useRouter();
  const [name,setName]=useState("");
  const [organizationId,setOrganizationId]=useState("");
  const [city,setCity]=useState("");
  const [state,setState]=useState("");
  const [timezone,setTimezone]=useState("");
  const [savedSiteId,setSavedSiteId]=useState<string|null>(null);
  const [error,setError]=useState("");
  const mutation=useWorkspaceMutation({mutationFn:createLaunchSite});
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(savedSiteId||mutation.isSubmitting)return;
    setError("");
    try {
      const result=await mutation.submit({data:{name,organizationId,slug:suggestedLaunchSlug(name)||"school",timezone,stubOnly:true,planningLocation:{city,state}}});
      if(result.status==="ignored")return;
      setSavedSiteId(result.value.siteId);
      try {await router.navigate({to:"/launch/hub/school",search:{siteId:result.value.siteId}});}
      catch {setError("Your school profile was saved. Use Open Launch Hub below; do not create another school.");}
    } catch(cause) {setError(mutationErrorMessage(cause,"Unable to create the school profile. Retry with the same details."));}
  }
  return <PageFrame width="wide" className="launch-studio-page">
    <Link to="/launch/hub/school" className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary">← Launch Hub</Link>
    <PageHeader eyebrow="School preparation / Basic profile" title="Create your school." subtitle="Start with the essentials. Add Programs, academics and your website from the Launch Hub later." />
    {!options.canCreateSite ? <section className="mt-6 border bg-card p-6"><p role="status">Your workspace cannot create another school. Open an existing authorized school from the Launch Hub.</p></section> : savedSiteId ? <section role="status" className="mt-6 border bg-card p-6"><h2 className="font-serif text-2xl">School profile saved</h2><Link to="/launch/hub/school" search={{siteId:savedSiteId}} className="mt-5 inline-flex min-h-11 items-center text-primary">Open Launch Hub →</Link></section> : <form onSubmit={event=>void submit(event)} className="mt-6 max-w-3xl space-y-5 border bg-card p-6 sm:p-8">
      <Field label="School name" required><Input required minLength={2} maxLength={160} value={name} onChange={event=>setName(event.target.value)} /></Field>
      <Field label="Responsible organization" required><Select required value={organizationId} onChange={event=>setOrganizationId(event.target.value)}><option value="">Choose your organization…</option>{options.organizations.map(organization=><option key={organization.id} value={organization.id}>{organization.name}</option>)}</Select></Field>
      <div className="grid gap-5 sm:grid-cols-2"><Field label="Primary city" required><Input required maxLength={120} value={city} onChange={event=>setCity(event.target.value)} /></Field>
      <Field label="State or territory" required><Select required value={state} onChange={event=>setState(event.target.value)}><option value="">Choose a state…</option>{Object.entries(usStatesAndTerritories).map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field></div>
      <SiteTimezoneField value={timezone} onChange={setTimezone}/>
      <p className="text-sm leading-6 text-muted-foreground">City and state are planning information. You can add the full facility address later. Saving does not publish a website or authorize school opening.</p>
      <Button type="submit" disabled={mutation.isSubmitting}>{mutation.isSubmitting?"Creating school…":"Create school & open Launch Hub"}</Button>
    </form>}
    {error&&<p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
    <section id="launch-help" className="mt-8 text-sm text-muted-foreground">Existing Site Administrators should open their saved school. Creating a new location requires organization-wide authority.</section>
  </PageFrame>;
}
