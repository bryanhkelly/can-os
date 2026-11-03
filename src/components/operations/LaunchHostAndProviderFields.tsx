import { LaunchSiteContactEditor, type LaunchSiteContactDraft } from "@/components/operations/LaunchSiteContactEditor";
import { LaunchSiteAddressEditor } from "@/components/operations/LaunchSiteAddressEditor";
import type { LaunchJurisdictionResearch as LaunchResearch } from "@/domain/jurisdiction-launch-research";
import { JurisdictionLaunchResearch } from "@/components/operations/JurisdictionLaunchResearch";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { addressStateJurisdiction } from "@/domain/site-jurisdiction-default";
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

export function LaunchHostAndProviderFields({ options, jurisdictionGuidance, jurisdictionResearch, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, newSiteAddress, setNewSiteAddress, saveSiteAddress, saveSiteContact, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }: {
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
  const siteJurisdictionId=addressStateJurisdiction(selectedSite?.address,options.jurisdictions);
  return (
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Organizations & jurisdiction
                </legend>
                <div className="mt-2 space-y-3">
                  <Field label="Host organization" required>
                    <Select
                      value={hostOrganizationId}
                      onChange={(e) => {
                        setHostOrganizationId(e.target.value);
                        setSiteId("");
                        setCreatedSiteDraft(null);
                      }}
                    >
                      <option value="">Select host organization…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="School location">
                    <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!hostOrganizationId}>
                      <option value="">Choose a school location…</option>
                      {hostSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name} · {site.timezone}</option>
                      ))}
                    </Select>
                  </Field>
                  {selectedSite && <LaunchSiteAddressEditor key={selectedSite.id+"-"+selectedSite.updatedAt}
                    initial={selectedSite.address} revision={selectedSite.updatedAt}
                    busy={busy} save={saveSiteAddress}/>}
                  {selectedSite && <LaunchSiteContactEditor key={selectedSite.id+"-"+selectedSite.updatedAt}
                    initial={selectedSite.contactDraft} revision={selectedSite.updatedAt}
                    busy={busy} save={saveSiteContact}/> }
                  {selectedSite && <div className="rounded-lg border px-4 py-3 text-sm">
                    <p className="font-semibold">Saved Site · {selectedSite.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedSite.addressStatus==="missing"?"Physical address not yet configured":
                        selectedSite.addressStatus==="legacy_needs_review"?"Older physical address needs correction and review":
                        selectedSite.addressStatus==="invalid_needs_correction"?"Saved physical address needs correction":
                        "Physical address supplied by the church, not independently approved"}
                      {" · "}{selectedSite.timezone}
                    </p>
                    <Link to="/site-website" className="mt-2 inline-block underline">
                      Optional: add existing church website, social and YouTube references
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">Church reference links are managed in the separate Site-scoped website editor; no public content is automatically imported or approved.</p>
                  </div>}
                  <details className="rounded-lg border p-3" open={!hostSites.length||Boolean(createdSiteDraft)}>
                    <summary className="cursor-pointer text-sm font-semibold">
                      {hostSites.length ? "Add another school location" : "Create your school location"}
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Field label="School location name">
                       <Input placeholder="Campus name" value={newSiteName} onChange={e=>{const value=e.target.value;setNewSiteName(value);if(!newSiteSlug||newSiteSlug===suggestedLaunchSlug(newSiteName))setNewSiteSlug(suggestedLaunchSlug(value));}}/>
                      </Field>
                      <Field label="School location slug">
                       <Input placeholder="campus-slug" value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      </Field>
                      <Field label="Location time zone">
                       <Select value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}>
                        <option value="">Choose the school time zone…</option>
                        {[...new Set([newSiteTimezone,"America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix","America/Anchorage","Pacific/Honolulu","UTC",...Intl.supportedValuesOf("timeZone")])].filter(Boolean).map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
                       </Select>
                      </Field>
                    </div>
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <p className="text-xs font-semibold">Physical location · for state guidance, not legal approval</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {([
                          ["street1","Street address"],["street2","Suite or building (optional)"],
                          ["city","City"],["state","State or region"],
                          ["postalCode","Postal code"],["country","Country"],
                          ["county","County (optional)"],
                        ] as const).map(([key,label])=>
                          <Field key={key} label={label}>
                            <Input value={newSiteAddress[key]} placeholder={label}
                              onChange={e=>setNewSiteAddress({...newSiteAddress,[key]:e.target.value})}/>
                          </Field>)}
                      </div>
                      <p className="text-xs text-muted-foreground">Enter the actual location of onsite learning. You can leave the address blank and complete it later; partial addresses cannot be saved. The legal jurisdiction must be reviewed separately.</p>
                    </div>
                    {duplicateNewSite && <p role="status" className="mt-2 text-xs">
                      This church already has the site “{duplicateNewSite.name}”. Choose it in the Site list above instead of creating a duplicate.
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
                  </details>
                  <Field label="Jurisdiction" required>
                    <Select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)}>
                      <option value="">Select jurisdiction…</option>
                      {options.jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name} ({jurisdiction.code})</option>
                      ))}
                    </Select>
                  </Field>
                  {selectedSite&&siteJurisdictionId&&jurisdictionId&&siteJurisdictionId!==jurisdictionId&&
                    <p role="alert" className="rounded-lg border border-amber-600/50 p-3 text-sm">
                      The selected jurisdiction differs from the Site address. Correct the location or jurisdiction before launch, or ask the CAN jurisdiction reviewer to document an authorized exception. A mismatched draft cannot establish legal applicability.
                    </p>}
                  {selectedSite&&!siteJurisdictionId&&
                    <p className="text-xs text-muted-foreground">This Site has no recognized state in its saved address. Confirm the jurisdiction manually; a timezone is not evidence of a school's legal location.</p>}
                  {jurisdictionId&&<div className="rounded-xl border border-border/70 bg-card p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">State setup guidance</p>
                    <JurisdictionLaunchResearch research={jurisdictionResearch[jurisdictionId]}/>
                  </div>}
                  <Field label="Academic provider" required>
                    <Select value={academicProviderOrganizationId} onChange={(e) => setAcademicProviderOrganizationId(e.target.value)}>
                      <option value="">Select academic provider…</option>
                      {options.academicProviderOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN academic provider)" : ""}</option>
                      ))}
                    </Select>
                  </Field>
                  {creditMode === "credit_bearing" ? (
                    <Field label="Credit-issuing organization" required>
                      <Select value={creditIssuingOrganizationId} onChange={(e) => setCreditIssuingOrganizationId(e.target.value)}>
                        <option value="">Select credit issuer…</option>
                        {options.creditIssuingOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN credit issuer)" : ""}</option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <p className="text-xs text-muted-foreground">Noncredit offering: no credit issuer required; it does not contribute to official transcripts.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Selecting CAN as the academic provider or credit issuer records a proposed arrangement only. It does not prove an executed agreement, school-of-record authority, accreditation or CAN staff access to the host's student records. Separate approval and access grants are required before operating.</p>
                </div>
              </fieldset>
  );
}
