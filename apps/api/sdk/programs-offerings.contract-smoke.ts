import type { BecomunaBrowserApi } from './client';

// Compiles against the generated browser OpenAPI schema, not handwritten DTOs.
// The function is intentionally not called: no network or mutations in type checks.
export async function checkProgramsOfferingsContract(client: BecomunaBrowserApi, id: string, hash: string) {
  const references = await client.GET('/api/v1/sites/{siteId}/program-references', { params: { path: { siteId: id } } });
  if (references.data) for (const reference of references.data) { const status: 'reference_only' = reference.status; void status; }
  const catalog = await client.GET('/api/v1/sites/{siteId}/available-offerings', { params: { path: { siteId: id }, query: { deliveryContext: 'hybrid' } } });
  if (catalog.data) for (const item of catalog.data) { const eligible: false = item.activationEligible; void eligible; }
  await client.GET('/api/v1/blueprint-configurations/{configurationId}', { params: { path: { configurationId: id } } });
  await client.POST('/api/v1/blueprint-configurations/submissions', { body: { configurationId: id, expectedRevision: 1 } });
  await client.POST('/api/v1/offering-adoption-approvals', { body: { adoptionId: id, evidenceVersionId: id, rationale: 'Independent evidence reviewed' } });
  await client.POST('/api/v1/offering-versions/{offeringVersionId}/publication', { params: { path: { offeringVersionId: id } }, body: { manifestId: id, expectedHash: hash } });
  await client.POST('/api/v1/noncredit-enrollment-releases', { body: {
    deploymentId: id, adoptionId: id, trainingVersionId: id, courseVersionId: id,
    deliveryMode: 'independent', siteId: id, opensAt: '2027-01-01T00:00:00Z', closesAt: '2027-02-01T00:00:00Z',
    maxParticipants: 100, consentVersion: 'v01', consentText: 'Published terms of participation'
  } });
  // @ts-expect-error optimistic revision is mandatory
  await client.POST('/api/v1/blueprint-configurations/submissions', { body: { configurationId: id } });
  // @ts-expect-error a caller cannot select the reviewer identity
  await client.POST('/api/v1/offering-adoption-approvals', { body: { adoptionId: id, evidenceVersionId: id, rationale: 'Independent evidence reviewed', reviewerPersonId: id } });
  // @ts-expect-error publication requires the exact manifest hash
  await client.POST('/api/v1/offering-versions/{offeringVersionId}/publication', { params: { path: { offeringVersionId: id } }, body: { manifestId: id } });
}
