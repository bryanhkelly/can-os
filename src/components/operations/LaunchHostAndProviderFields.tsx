import { LaunchSiteContactEditor, type LaunchSiteContactDraft } from "@/components/operations/LaunchSiteContactEditor";
import { LaunchSiteAddressFields } from "./LaunchSiteAddressFields";
import { LaunchSiteIdentityEditor } from "./LaunchSiteIdentityEditor";
import { LaunchSiteAddressEditor } from "@/components/operations/LaunchSiteAddressEditor";
import type { LaunchJurisdictionResearch as LaunchResearch } from "@/domain/jurisdiction-launch-research";
import { JurisdictionLaunchResearch } from "@/components/operations/JurisdictionLaunchResearch";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { addressStateJurisdiction, launchSiteJurisdictionIssue, siteJurisdictionLocation } from "@/domain/site-jurisdiction-default";
import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";
import { Link } from "@tanstack/react-router";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type SavedLaunchSiteDraft = {siteId:string;host:string;status:"draft"|"published";replayed:boolean};

export type LaunchSiteAddressDraft = {
  street1: string; street2: string; city: string; state: string;
  postalCode: string; country: string; county: string;
};

export function LaunchHostAndProviderFields({ options, jurisdictionResearch, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, newSiteAddress, setNewSiteAddress, saveSiteAddress, saveSiteContact, saveSiteIdentity, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }: {
  options: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>;
  jurisdictionGuidance: Record<string,{summary:string;publishedAt:string|null}>;
  jurisdictionResearch: Record<string,LaunchResearch>;
  hostOrganizationId: string; setHostOrganizationId: (value: string) => void;
  siteId: string; setSiteId: (value: string) => void;
  setCreatedSiteDraft: (value: SavedLaunchSiteDraft | null) => void;
  hostSites: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>["sites"];
  newSiteName: string; setNewSiteName: (value: string) => void;
  newSiteSlug: string; setNewSiteSlug: (value: string) => void;
  newSiteTimezone: string; setNewSiteTimezone: (value: string) => void;
  saveSiteAddress: (address:LaunchSiteAddressDraft,revision:string,reason:string)=>Promise<void>;
  saveSiteContact: (contact:LaunchSiteContactDraft|null,revision:string)=>Promise<void>;
  saveSiteIdentity: (identity:{name:string;timezone:string},revision:string,reason:string)=>Promise<void>;
  newSiteAddress: LaunchSiteAddressDraft;
  setNewSiteAddress: (value: LaunchSiteAddressDraft) => void;
  duplicateNewSite: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>["sites"][number] | undefined;
  createdSiteDraft: SavedLaunchSiteDraft | null;
  busy: boolean; addSite: () => Promise<void>;
  jurisdictionId: string; setJurisdictionId: (value: string) => void;
  academicProviderOrganizationId: string; setAcademicProviderOrganizationId: (value: string) => void;
  creditMode: "credit_bearing" | "non_credit";
  creditIssuingOrganizationId: string; setCreditIssuingOrganizationId: (value: string) => void;
}) {
  const selectedSite=hostSites.find(item=>item.id===siteId);
  const jurisdictionLocation=siteJurisdictionLocation(selectedSite?.address,selectedSite?.planningLocation);
  const siteJurisdictionId=addressStateJurisdiction(jurisdictionLocation,options.jurisdictions);
  const jurisdictionIssue=launchSiteJurisdictionIssue(jurisdictionLocation,options.jurisdictions,jurisdictionId);
  return (
              <fieldset>
                <legend className="text-sm text-muted-foreground">
                  Location &amp; school responsibilities
                </legend>
                <div className="mt-2 space-y-3">
                  <Field label="School organization" required>
                    <Select
                      value={hostOrganizationId}
                      onChange={(e) => {
                        setHostOrganizationId(e.target.value);
                        setSiteId("");
                        setCreatedSiteDraft(null);
                      }}
                    >
                      <option value="">Choose your organization…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <LaunchFieldHelp label="About the school organization">The church, school or organization responsible for the location. It may be different from the organization providing teaching.</LaunchFieldHelp>
                  <Field label="School location">
                    <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!hostOrganizationId}>
                      <option value="">Choose a school location…</option>
                      {hostSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </Select>
                  </Field>
                  {selectedSite && <LaunchSiteIdentityEditor key={"identity-"+selectedSite.id+"-"+selectedSite.updatedAt}
                    initial={{name:selectedSite.name,timezone:selectedSite.timezone,slug:selectedSite.slug}}
                    revision={selectedSite.updatedAt} busy={busy} save={saveSiteIdentity}/>}
                  {selectedSite && <LaunchSiteAddressEditor key={"address-"+selectedSite.id+"-"+selectedSite.updatedAt}
                    initial={selectedSite.address} revision={selectedSite.updatedAt}
                    busy={busy} save={saveSiteAddress}/>}
                  {selectedSite && <LaunchSiteContactEditor key={"contact-"+selectedSite.id+"-"+selectedSite.updatedAt}
                    initial={selectedSite.contactDraft} revision={selectedSite.updatedAt}
                    busy={busy} save={saveSiteContact}/> }
                  {selectedSite && <details className="rounded-lg border px-4 py-3 text-sm">
                    <summary className="cursor-pointer">Website access &amp; saved address</summary>
                    {selectedSite.websiteDraft && <p className="mt-2 text-xs text-muted-foreground">
                      {selectedSite.websiteDraft.status==="published"?"Published website":"Private website draft"}
                      {" · "}<span className="font-mono">{selectedSite.websiteDraft.host}</span>
                    </p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Only an assigned website editor can manage website references. Nothing is imported or published automatically.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <Link to="/admin" search={{siteId:selectedSite.id,inviteRole:"site_website_editor"}} className="underline">
                        Invite a website editor
                      </Link>
                      <Link to="/site-website" search={{siteId:selectedSite.id}} className="underline">
                        Manage references (website editor access needed)
                      </Link>
                    </div>
                  </details>}
                  {options.canCreateSite && <details className="rounded-lg border p-3" open={!hostSites.length||Boolean(createdSiteDraft)}>
                    <summary className="cursor-pointer text-sm font-semibold">
                      {hostSites.length ? "Add another school location" : "Create your school location"}
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Field label="School location name">
                       <Input placeholder="Campus name" value={newSiteName} onChange={e=>{const value=e.target.value;setNewSiteName(value);if(!newSiteSlug||newSiteSlug===suggestedLaunchSlug(newSiteName))setNewSiteSlug(suggestedLaunchSlug(value));}}/>
                      </Field>
                      <Field label="Location short name">
                       <Input placeholder="e.g., barton-campus" value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      </Field>
                      <Field label="Location time zone">
                       <Select value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}>
                        <option value="">Choose the school time zone…</option>
                        {[...new Set([newSiteTimezone,"America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix","America/Anchorage","Pacific/Honolulu","UTC",...Intl.supportedValuesOf("timeZone")])].filter(Boolean).map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
                       </Select>
                      </Field>
                    </div>
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <p className="text-sm text-muted-foreground">School address</p>
                      <LaunchSiteAddressFields address={newSiteAddress} onChange={setNewSiteAddress}/>
                      <p className="text-sm text-muted-foreground">Use the address where students will meet. Add the full address, or leave it blank for now.</p>
                    </div>
                    {duplicateNewSite && <p role="status" className="mt-2 text-xs">
                      “{duplicateNewSite.name}” is already saved. Choose it above instead of adding the same location again.
                    </p>}
                    <Button type="button" variant="outline" size="sm" disabled={busy||!hostOrganizationId||!newSiteName.trim()||!newSiteSlug.trim()||!newSiteTimezone||Boolean(duplicateNewSite)} onClick={addSite} className="mt-3">Save school location</Button>
                    {createdSiteDraft && <div role="status" className="mt-3 rounded-lg border p-3 text-sm">
                      <p className="font-semibold">{createdSiteDraft.status==="published"?"Your saved school website is already published":createdSiteDraft.replayed?"Resumed your existing school Site and private website draft":"Your private school website draft is prepared"}</p>
                      <p className="mt-1 font-mono">{createdSiteDraft.host}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {createdSiteDraft.status==="published"?"This Site already has a published website. Publication is separate from admissions and authorization.":"Private website draft only. The host is reserved, but no public school site, admissions,"}
                        Family enrollment and legal opening remain independently gated. Any new public claims require review by an authorized Site publisher.
                      </p>
                      <Link to="/sites/$siteId/publish" params={{siteId:createdSiteDraft.siteId}}
                        className="mt-2 inline-block underline">Open private website setup (publisher access required) →</Link>
                    </div>}
                  </details>}
                  <Field label="State or region" required error={jurisdictionIssue?.message}>
                    <Select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)}>
                      <option value="">Choose your state or region…</option>
                      {options.jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <LaunchFieldHelp label="Why we ask for your state or region">School requirements depend on where students meet. Choosing a state records your plans; it is not legal approval to open.</LaunchFieldHelp>
                  {selectedSite&&!siteJurisdictionId&&!jurisdictionIssue&&
                    <p role="status" className="text-sm text-muted-foreground">We couldn't match your address to a supported state. Confirm the address and country, or ask CAN to review support for your location.</p>}
                  {jurisdictionId&&<details className="rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm">View state setup guidance</summary>
                    <JurisdictionLaunchResearch research={jurisdictionResearch[jurisdictionId]}/>
                  </details>}
                  <Field label="Teaching organization" required>
                    <Select value={academicProviderOrganizationId} onChange={(e) => setAcademicProviderOrganizationId(e.target.value)}>
                      <option value="">Choose who provides teaching…</option>
                      {options.academicProviderOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <LaunchFieldHelp label="About the teaching organization">The organization providing instruction and curriculum. Selecting CAN records a proposed arrangement, not an approved agreement or access to student records.</LaunchFieldHelp>
                  {creditMode === "credit_bearing" ? (
                    <Field label="Transcript organization" required>
                      <Select value={creditIssuingOrganizationId} onChange={(e) => setCreditIssuingOrganizationId(e.target.value)}>
                        <option value="">Choose who awards academic credit…</option>
                        {options.creditIssuingOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <p className="text-sm text-muted-foreground">This offering doesn't award academic credit or appear on official transcripts.</p>
                  )}
                  {creditMode==="credit_bearing"&&<LaunchFieldHelp label="About the transcript organization">The organization responsible for awarding credit and official academic records. Its authority and any agreements must be reviewed before your school operates.</LaunchFieldHelp>}
                </div>
              </fieldset>
  );
}
