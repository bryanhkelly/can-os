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

export async function checkAuthoringContracts(client:BecomunaBrowserApi,id:string,hash:string){
 const course={courseVersionId:id};
 const lessons=await client.GET('/api/v1/course-versions/{courseVersionId}/draft-lessons',{params:{path:course,query:{offset:80}}});
 if(lessons.data){const limited:boolean=lessons.data.limited;const next:number|null=lessons.data.nextOffset;void limited;void next;}
 await client.POST('/api/v1/course-versions/{courseVersionId}/draft-lessons/{lessonId}/revisions',{params:{path:{...course,lessonId:id}},body:{title:'Lesson title',objectives:['Learn a concept'],segments:[{title:'Introduction',minutes:20}],expectedRevision:hash}});
 await client.POST('/api/v1/course-versions/{courseVersionId}/draft-assignments',{params:{path:course},body:{assignmentKey:'assignment_1',title:'Assignment title',instructions:'Explain the concept',required:true}});
 await client.GET('/api/v1/course-versions/{courseVersionId}/draft-assignments',{params:{path:course,query:{offset:0}}});
 await client.GET('/api/v1/course-versions/{courseVersionId}/release-readiness',{params:{path:course}});
 await client.GET('/api/v1/programs/{programId}/publisher-packs',{params:{path:{programId:id}}});
 await client.POST('/api/v1/programs/{programId}/publisher-packs',{params:{path:{programId:id}},body:{requestId:id,slug:'new-pack',name:'New pack',description:'A published curriculum collection',visibility:'private',licenseCode:'CC0'}});
 await client.POST('/api/v1/programs/{programId}/publisher-packs/{packId}/drafts',{params:{path:{programId:id,packId:id}},body:{requestId:id}});
 await client.POST('/api/v1/programs/{programId}/publisher-packs/versions/{versionId}/revisions',{params:{path:{programId:id,versionId:id}},body:{expectedRevision:hash,courseVersionIds:[id]}});
 await client.POST('/api/v1/programs/{programId}/publisher-packs/versions/{versionId}/publication',{params:{path:{programId:id,versionId:id}},body:{expectedRevision:hash,confirmed:true,reason:'Reviewed publication'}});
 // @ts-expect-error the revision cannot be omitted
 await client.POST('/api/v1/programs/{programId}/publisher-packs/versions/{versionId}/revisions',{params:{path:{programId:id,versionId:id}},body:{courseVersionIds:[id]}});
 // @ts-expect-error caller must not set publication authority
 await client.POST('/api/v1/course-versions/{courseVersionId}/draft-assignments',{params:{path:course},body:{assignmentKey:'assignment_1',title:'Assignment title',instructions:'Explain the concept',required:true,reviewerPersonId:id}});
}
