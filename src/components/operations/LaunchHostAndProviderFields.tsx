import { jurisdictionSetupGuidance } from "@/domain/jurisdiction-setup-guidance";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { Link } from "@tanstack/react-router";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";

const inputClass = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
const selectClass = inputClass;

export function LaunchHostAndProviderFields({ options, jurisdictionGuidance, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }: {
  options: NonNullable<Awaited<ReturnType<typeof listLaunchOptions>>>;
  jurisdictionGuidance: Record<string,{summary:string;publishedAt:string|null}>;
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
                  <label className="block text-xs">
                    Host organization
                    <select
                      aria-label="Host organization"
                      className={selectClass}
                      value={hostOrganizationId}
                      onChange={(e) => {
                        setHostOrganizationId(e.target.value);
                        setSiteId("");
                        setCreatedSiteDraft(null);
                      }}
                      required
                    >
                      <option value="">Select host organization…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    School location
                    <select aria-label="Site" className={selectClass} value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!hostOrganizationId}>
                      <option value="">Choose a school location…</option>
                      {hostSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name} · {site.timezone}</option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">Add a school location</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input aria-label="New site name" placeholder="Campus name" className={inputClass} value={newSiteName} onChange={e=>{const value=e.target.value;setNewSiteName(value);if(!newSiteSlug||newSiteSlug===suggestedLaunchSlug(newSiteName))setNewSiteSlug(suggestedLaunchSlug(value));}}/>
                      <input aria-label="New site slug" placeholder="campus-slug" className={inputClass} value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      <label className="text-xs">Location time zone
                       <select aria-label="New site timezone" className={selectClass} value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}>
                        {[...new Set([newSiteTimezone,"America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix","America/Anchorage","Pacific/Honolulu","UTC",...Intl.supportedValuesOf("timeZone")])].map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
                       </select>
                      </label>
                    </div>
                    {duplicateNewSite && <p role="status" className="mt-2 text-xs">
                      This church already has the site “{duplicateNewSite.name}”. Choose it in the Site list above instead of creating a duplicate.
                    </p>}
                    <button type="button" disabled={busy||!hostOrganizationId||!newSiteName.trim()||!newSiteSlug.trim()||Boolean(duplicateNewSite)} onClick={addSite} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Save school location</button>
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
                  <label className="block text-xs">
                    Jurisdiction
                    <select aria-label="Jurisdiction" className={selectClass} value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} required>
                      <option value="">Select jurisdiction…</option>
                      {options.jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name} ({jurisdiction.code})</option>
                      ))}
                    </select>
                  </label>
                  {jurisdictionId&&<div className="rounded-xl border border-border/70 bg-card p-4" role="status">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">State setup guidance</p>
                    {jurisdictionGuidance[jurisdictionId]?<>
                     <p className="mt-2 text-sm leading-6">{jurisdictionGuidance[jurisdictionId].summary}</p>
                     <p className="mt-2 text-xs text-muted-foreground">Published guidance is informational. Your school still needs its own operating approvals.</p>
                    </>:<>
                     <p className="mt-2 text-sm">State-specific guidance is being reviewed. You can continue preparing your school.</p>
                     <p className="mt-2 text-xs text-muted-foreground">Configuration does not authorize enrollment or operation.</p>
                    </>}
                  </div>}
                  <label className="block text-xs">
                    Academic provider
                    <select aria-label="Academic provider organization" className={selectClass} value={academicProviderOrganizationId} onChange={(e) => setAcademicProviderOrganizationId(e.target.value)} required>
                      <option value="">Select academic provider…</option>
                      {options.academicProviderOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN academic provider)" : ""}</option>
                      ))}
                    </select>
                  </label>
                  {creditMode === "credit_bearing" ? (
                    <label className="block text-xs">
                      Credit-issuing organization
                      <select aria-label="Credit issuing organization" className={selectClass} value={creditIssuingOrganizationId} onChange={(e) => setCreditIssuingOrganizationId(e.target.value)} required>
                        <option value="">Select credit issuer…</option>
                        {options.creditIssuingOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN credit issuer)" : ""}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="text-xs text-muted-foreground">Noncredit offering: no credit issuer required; it does not contribute to official transcripts.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Selecting CAN as the academic provider or credit issuer records a proposed arrangement only. It does not prove an executed agreement, school-of-record authority, accreditation or CAN staff access to the host's student records. Separate approval and access grants are required before operating.</p>
                </div>
              </fieldset>
  );
}
