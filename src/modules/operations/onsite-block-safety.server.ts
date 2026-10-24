import { desc, eq, inArray } from "drizzle-orm";
import { AuthorizationError } from "@/domain/command-context";
import { qualificationClaims, qualificationDefinitions } from "@/db/schema";
import { db } from "@/db/client";
import {
  documents,
  qualificationVerificationEvents,
} from "@/db/schema";
import { coversLocalSupervisionBlock } from "@/domain/onsite-supervision-coverage";

/**
 * Qualification keys are explicit policy prerequisites, NOT an inference from
 * a person's account, job title, employer, Section assignment or attendance.
 * The verified review of an uploaded document does not itself establish that
 * the site is legally cleared to open; jurisdictions must still approve policy.
 */
export const ONSITE_SCREENING = "onsite_child_safety_screening";
export const ONSITE_TRAINING = "onsite_safeguarding_training";

type Reader = Pick<typeof db, "selectDistinctOn">;
type Evidence = { from: Date; through: Date | null };
export type AdultSafetyEvidence = {
  screening: readonly Evidence[];
  training: readonly Evidence[];
};

/** Only the LATEST verification decision on each individual claim is trusted.
 * Approved means an independent reviewer approved an independently verified
 * document, for the right person, within its effective interval. A newer
 * revoke/reject/submit decision or expired evidence immediately removes it.
 */
export async function verifiedAdultSafetyEvidence(
  tx: Reader,
  personIds: readonly string[],
): Promise<ReadonlyMap<string, AdultSafetyEvidence>> {
  const ids=[...new Set(personIds)];
  const result=new Map<string, AdultSafetyEvidence>();
  if(!ids.length) return result;
  const claims=await tx.selectDistinctOn([qualificationClaims.id], {
    claimId:qualificationClaims.id,
    personId:qualificationClaims.personId,
    key:qualificationDefinitions.key,
    issuedAt:qualificationClaims.issuedAt,
    expiresAt:qualificationClaims.expiresAt,
    decision:qualificationVerificationEvents.decision,
    reviewedBy:qualificationVerificationEvents.actorPersonId,
    reviewedAt:qualificationVerificationEvents.occurredAt,
    evidenceId:qualificationVerificationEvents.evidenceDocumentId,
    docCategory:documents.category,
    docStorageProvider:documents.storageProvider,
    docStorageKey:documents.storageKey,
    docSensitivity:documents.sensitivityTier,
    docUploader:documents.uploadedByPersonId,
    docMetadata:documents.metadata,
    docSubjectType:documents.subjectType,
    docSubjectId:documents.subjectId,
    docVerifiedAt:documents.verifiedAt,
    docVerifiedBy:documents.verifiedByPersonId,
    docExpiresAt:documents.expiresAt,
  }).from(qualificationClaims)
    .innerJoin(qualificationDefinitions,eq(qualificationDefinitions.id,qualificationClaims.definitionId))
    .leftJoin(qualificationVerificationEvents,eq(qualificationVerificationEvents.claimId,qualificationClaims.id))
    .leftJoin(documents,eq(documents.id,qualificationVerificationEvents.evidenceDocumentId))
    .where(inArray(qualificationClaims.personId,ids))
    .orderBy(qualificationClaims.id,desc(qualificationVerificationEvents.sequence));
  for(const row of claims){
    if(row.key!==ONSITE_SCREENING && row.key!==ONSITE_TRAINING)continue;
    // The canonical qualification uploader verifies R2 content/signature and
    // sets documents.verifiedAt; a separate human verification event
    // approves the Person's claim. uploaded evidence must be exactly the
    // existing restricted cloudflare_r2 qualification Document for this claim.
    // documents.verifiedByPersonId may be null for signature-verified uploads;
    // do not conflate that with an absent independent claim reviewer.
    if(row.decision!=="approve" || row.docCategory!=="qualification" ||
       !row.evidenceId || !row.reviewedBy ||
       row.reviewedBy===row.personId || !row.reviewedAt ||
       row.docSubjectType!=="person" || row.docSubjectId!==row.personId ||
       row.docUploader!==row.personId ||
       row.docStorageProvider!=="cloudflare_r2" ||
       row.docSensitivity!=="restricted" ||
       typeof row.docStorageKey!=="string" ||
       !row.docStorageKey.startsWith(`qualifications/${row.personId}/`) ||
       row.docMetadata?.claimId!==row.claimId ||
       !row.docVerifiedAt || row.docVerifiedAt>new Date() ||
       (row.docVerifiedBy && row.docVerifiedBy===row.personId))continue;
    const from=new Date(Math.max(
      row.issuedAt?.getTime()??Infinity,
      row.reviewedAt.getTime(),
      row.docVerifiedAt.getTime(),
    ));
    if(!Number.isFinite(from.getTime()))continue;
    const expirations=[row.expiresAt,row.docExpiresAt].filter(
      (value):value is Date=>value!==null,
    );
    // Without a bounded expiration this material cannot attest to current
    // child-safety clearance; older certificates must be periodically reviewed.
    if(!expirations.length)continue;
    const through=new Date(Math.min(...expirations.map(x=>x.getTime())));
    if(through<=from)continue;
    const existing=result.get(row.personId)??{screening:[],training:[]};
    if(row.key===ONSITE_SCREENING)
      result.set(row.personId,{...existing,screening:[...existing.screening,{from,through}]});
    else result.set(row.personId,{...existing,training:[...existing.training,{from,through}]});
  }
  return result;
}

export function verifiedAdultCoversBlock(
  evidence:AdultSafetyEvidence|undefined, input:{
    date:string;timeZone:string;startsAtLocal:string|null;endsAtLocal:string|null;
  },
) {
  const window=input.startsAtLocal && input.endsAtLocal ? {
    date:input.date,timeZone:input.timeZone,
    startsAtLocal:input.startsAtLocal,endsAtLocal:input.endsAtLocal,
  }:null;
  const covers=(rows:readonly Evidence[]|undefined)=>!!window && !!rows?.some(row=>
    coversLocalSupervisionBlock({
      ...window,effectiveFrom:row.from,effectiveThrough:row.through,
    }));
  return {
    screening:covers(evidence?.screening),
    training:covers(evidence?.training),
  };
}

/**
 * Affirmative onsite-duty commands recheck under a share lock on the claim
 * parent rows. Qualification review takes FOR UPDATE on the same rows before
 * recording a new verification decision, so a concurrent revoke cannot be
 * skipped between the staff check and commitment of the accepted duty.
 */
export async function requireCurrentOnsiteAdultSafety(
  tx: Pick<typeof db, "select"|"selectDistinctOn">,
  input:{personId:string;date:string;timeZone:string;
    startsAtLocal:string|null;endsAtLocal:string|null},
) {
  const rows=await tx.select({id:qualificationClaims.id})
    .from(qualificationClaims)
    .innerJoin(qualificationDefinitions,
      eq(qualificationClaims.definitionId,qualificationDefinitions.id))
    .where(inArray(qualificationClaims.personId,[input.personId]))
    .for("share");
  // Neither an absent claim nor a claim with a stale verification can satisfy
  // this gate. Locking does not imply a credential is actually valid.
  if(!rows.length)
    throw new AuthorizationError("independently verified onsite staff screening and training");
  const evidence=(await verifiedAdultSafetyEvidence(tx,[input.personId])).get(input.personId);
  const coverage=verifiedAdultCoversBlock(evidence,input);
  if(!coverage.screening || !coverage.training)
    throw new AuthorizationError("current verified screening and safeguarding training for entire assigned block");
}
