import type { LaunchJurisdictionResearch as LaunchResearch } from "@/domain/jurisdiction-launch-research";
import { JurisdictionLaunchResearch } from "@/components/operations/JurisdictionLaunchResearch";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { Link } from "@tanstack/react-router";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function LaunchHostAndProviderFields({ options, jurisdictionGuidance, jurisdictionResearch, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }: {
  options: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>;
  jurisdictionGuidance: Record<string,{summary:string;publishedAt:string|null}>;
  jurisdictionResearch: Record<string,LaunchResearch>;
  hostOrganizationId: string; setHostOrganizationId: (value: string) => void;
  siteId: string; setSiteId: (value: string) => void;
  setCreatedSiteDraft: (value: {siteId:string;host:string} | null) => void;
  hostSites: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>["sites"];
  newSiteName: string; setNewSiteName: (value: string) => void;
  newSiteSlug: string; setNewSiteSlug: (value: string) => void;
  newSiteTimezone: string; setNewSiteTimezone: (value: string) => void;
  duplicateNewSite: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>["sites"][number] | undefined;
  createdSiteDraft: {siteId:string;host:string} | null;
  busy: boolean; addSite: () => Promise<void>;
  jurisdictionId: string; setJurisdictionId: (value: string) => void;
  academicProviderOrganizationId: string; setAcademicProviderOrganizationId: (value: string) => void;
  creditMode: "credit_bearing" | "non_credit";
  creditIssuingOrganizationId: string; setCreditIssuingOrganizationId: (value: string) => void;
}) {
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
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">Add a school location</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Field label="School location name">
                       <Input placeholder="Campus name" value={newSiteName} onChange={e=>{const value=e.target.value;setNewSiteName(value);if(!newSiteSlug||newSiteSlug===suggestedLaunchSlug(newSiteName))setNewSiteSlug(suggestedLaunchSlug(value));}}/>
                      </Field>
                      <Field label="School location slug">
                       <Input placeholder="campus-slug" value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      </Field>
                      <Field label="Location time zone">
                       <Select value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}>
                        {[...new Set([newSiteTimezone,"America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix","America/Anchorage","Pacific/Honolulu","UTC",...Intl.supportedValuesOf("timeZone")])].map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
                       </Select>
                      </Field>
                    </div>
                    {duplicateNewSite && <p role="status" className="mt-2 text-xs">
                      This church already has the site “{duplicateNewSite.name}”. Choose it in the Site list above instead of creating a duplicate.
                    </p>}
                    <Button type="button" variant="outline" size="sm" disabled={busy||!hostOrganizationId||!newSiteName.trim()||!newSiteSlug.trim()||Boolean(duplicateNewSite)} onClick={addSite} className="mt-3">Save school location</Button>
                    {createdSiteDraft && <div role="status" className="mt-3 rounded-lg border p-3 text-sm">
                      <p className="font-semibold">Your website draft is prepared</p>
                      <p className="mt-1 font-mono">{createdSiteDraft.host}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Private draft only. The address is reserved, but no public site, admissions,
                        or registration is open. An explicitly authorized Site publisher must
                        review and approve marketing before publication.
                      </p>
                      <Link to="/sites/$siteId/publish" params={{siteId:createdSiteDraft.siteId}}
                        className="mt-2 inline-block underline">Open private website setup (publisher access required) →</Link>
                    </div>}
                  </div>
                  <Field label="Jurisdiction" required>
                    <Select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)}>
                      <option value="">Select jurisdiction…</option>
                      {options.jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name} ({jurisdiction.code})</option>
                      ))}
                    </Select>
                  </Field>
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
