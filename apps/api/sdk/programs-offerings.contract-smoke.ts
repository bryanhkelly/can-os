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

export async function checkMarketplaceContracts(client:BecomunaBrowserApi,id:string){
 const program={programId:id},annual={...program,packId:id,academicYearId:id};
 await client.GET('/api/v1/curriculum-adopter-programs');
 const market=await client.GET('/api/v1/programs/{programId}/curriculum-marketplace',{params:{path:program}});
 if(market.data){const enabled:boolean=market.data.canPublish;void enabled;}
 await client.GET('/api/v1/programs/{programId}/curriculum-journey-readiness',{params:{path:program}});
 await client.POST('/api/v1/programs/{programId}/curriculum-entitlements',{params:{path:program},body:{packId:id,termsAccepted:true}});
 await client.POST('/api/v1/programs/{programId}/curriculum-adoptions',{params:{path:program},body:{packId:id,versionId:id}});
 await client.GET('/api/v1/programs/{programId}/curriculum-packs/{packId}/academic-years/{academicYearId}/adoption',{params:{path:annual}});
 await client.POST('/api/v1/programs/{programId}/curriculum-packs/{packId}/academic-years/{academicYearId}/adoption',{params:{path:annual},body:{versionId:id}});
 await client.POST('/api/v1/programs/{programId}/curriculum-packs/{packId}/academic-years/{academicYearId}/adoption/rollbacks',{params:{path:annual},body:{reason:'Verified license withdrawn'}});
 await client.POST('/api/v1/programs/{programId}/curriculum-supplements',{params:{path:program},body:{courseVersionId:id,scope:'program',title:'Learning resource',kind:'link',url:'https://example.org/resource'}});
 // @ts-expect-error terms must be explicitly accepted
 await client.POST('/api/v1/programs/{programId}/curriculum-entitlements',{params:{path:program},body:{packId:id,termsAccepted:false}});
 // @ts-expect-error cannot set academic year implicitly or in an unrelated body
 await client.POST('/api/v1/programs/{programId}/curriculum-packs/{packId}/academic-years/{academicYearId}/adoption',{params:{path:{...program,packId:id}},body:{versionId:id}});
}

export async function checkInstructionalTrackContracts(client:BecomunaBrowserApi,id:string,hash:string){
 const course={courseVersionId:id},track={trackVersionId:id},release={requestId:id,expectedRevision:hash};
 await client.POST('/api/v1/course-versions/{courseVersionId}/instructional-track-drafts',{params:{path:course},body:{requestId:id,title:'Recorded instruction',trackKind:'primary'}});
 await client.GET('/api/v1/instructional-track-versions/{trackVersionId}/draft',{params:{path:track}});
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/revisions',{params:{path:track},body:{...release,materials:[],presentations:[{courseLessonId:id,assetVersionId:id,presentationKind:'primary',ordinal:1}]}});
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/submissions',{params:{path:track},body:release});
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/reviews',{params:{path:track},body:{...release,reviewKind:'rights',decision:'approved',rationale:'Verified rights evidence',evidenceVersionId:id}});
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/publication',{params:{path:track},body:release});
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/withdrawals',{params:{path:track},body:{requestId:id,withdrawalKind:'urgent_rights',reason:'Rights withdrawn by owner',legacyAccessUntil:null}});
 // @ts-expect-error review authority is derived from the authenticated Person
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/reviews',{params:{path:track},body:{...release,reviewKind:'academic',decision:'approved',rationale:'Independent review',reviewerPersonId:id}});
 // @ts-expect-error publication requires the exact submitted manifest hash
 await client.POST('/api/v1/instructional-track-versions/{trackVersionId}/publication',{params:{path:track},body:{requestId:id}});
}
