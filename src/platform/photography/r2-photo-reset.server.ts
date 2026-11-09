import type {TemplatePhotoBucket} from "./cloudflare-production.server";

/**
 * Single-purpose cleanup for the November 2026 fictional template photography
 * rebuild. Never touches real school uploads, private user media, v1/v2 sample
 * assets, or any R2 key outside the three exact namespaces below.
 *
 * Every object must be copied into a separate, private immutable archive and
 * verified by size before deleting its original. No fal.ai network calls.
 */
export const PHOTO_RESET_ID="2026-11-09-template-photo-refresh";
export const PHOTO_RESET_STATE_KEY=
  "school-template-maintenance/2026-11-09-template-photo-refresh.json";
export const PHOTO_RESET_ARCHIVE_PREFIX=
  "school-template-photo-archive/2026-11-09/";
export const PHOTO_RESET_PREFIXES=[
  "school-template-previews/v3/",
  "school-template-production/v1/",
  "school-template-production/pilot-summit-20261108/",
] as const;

export type TemplatePhotoResetState={
  resetId:string;
  phase:"running"|"completed"|"blocked";
  copied:number;
  removed:number;
  updatedAt:string;
  currentPrefix?:string;
  reason?:string;
};

const template="(?:heritage|community|modern|bright|bright-futures|summit|classic|campus)";
const role="(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])";
const photoPattern=new RegExp(
  `^school-template-previews/v3/(?:${template}/${role}\\.(?:jpg|jpeg|png|webp)|_archive/${template}/[a-f0-9-]{36}\\.(?:jpg|jpeg|png|webp))$`,
);
const jobPattern=new RegExp(
  `^school-template-production/v1/(?:${template}/${role}\\.json|cursor\\.json|r2-write-verified\\.json|fal-history-recovery\\.json)$`,
);
const pilotPattern=/^school-template-production\/pilot-summit-20261108\/hero\.json$/;

export function isOwnedTemplatePhotoResetKey(key:string):boolean{
  return photoPattern.test(key)||jobPattern.test(key)||pilotPattern.test(key);
}

export async function readTemplatePhotoResetState(
  bucket:TemplatePhotoBucket,
):Promise<TemplatePhotoResetState|null>{
  const object=await bucket.get(PHOTO_RESET_STATE_KEY);
  if(!object)return null;
  try{
    const state=JSON.parse(await object.text()) as TemplatePhotoResetState;
    if(state.resetId===PHOTO_RESET_ID&&
       ["running","completed","blocked"].includes(state.phase))
      return state;
  }catch{/* Treat invalid/missing state as no completed reset. */}
  return null;
}

async function writeState(
  bucket:TemplatePhotoBucket,state:TemplatePhotoResetState,
):Promise<void>{
  const record=JSON.stringify(state);
  const stored=await bucket.put(PHOTO_RESET_STATE_KEY,record,{
    httpMetadata:{contentType:"application/json"},
  });
  if(!stored)throw Error("Photo reset checkpoint write failed");
}

const timestamp=()=>new Date().toISOString();
function equalBytes(a:ArrayBuffer,b:ArrayBuffer):boolean{
  if(a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a),y=new Uint8Array(b);
  for(let i=0;i<x.byteLength;i++)if(x[i]!==y[i])return false;
  return true;
}

/**
 * Archives and removes at most four objects per cron tick, so every transfer
 * fits inside Cloudflare Worker limits. Subsequent cron ticks resume from R2.
 * A previously completed marker makes the operation a permanent no-op.
 */
export async function advanceTemplatePhotoReset(
  bucket:TemplatePhotoBucket,
):Promise<TemplatePhotoResetState>{
  let state=await readTemplatePhotoResetState(bucket)??{
    resetId:PHOTO_RESET_ID,phase:"running",copied:0,removed:0,
    updatedAt:timestamp(),
  } satisfies TemplatePhotoResetState;
  if(state.phase==="completed")return state;
  // A blocked state must be addressed before trying other keys.
  if(state.phase==="blocked")return state;

  let budget=4;
  for(const prefix of PHOTO_RESET_PREFIXES){
    if(budget<=0)break;
    // No pagination needed within a tick: deleting the first few matches
    // exposes the next page of keys on the next scheduled invocation.
    const batch=await bucket.list({prefix,limit:100});
    for(const item of batch.objects){
      if(budget<=0)break;
      const key=item.key;
      if(!key.startsWith(prefix)||!isOwnedTemplatePhotoResetKey(key)){
        state={...state,phase:"blocked",currentPrefix:prefix,
          reason:"Unexpected object outside the cleanup allowlist",
          updatedAt:timestamp()};
        await writeState(bucket,state);
        return state;
      }
      const source=await bucket.get(key);
      if(!source)continue;
      const sourceInfo=await bucket.head(key);
      if(!sourceInfo)continue;
      // Cloudflare R2 put() requires a stream with a known length. Buffering
      // these capped 25MB originals is safer than streaming an unknown length.
      if(sourceInfo.size>25_000_000)
        throw Error("Photo reset refuses to buffer an oversized object");
      const originalBytes=await new Response(source.body).arrayBuffer();
      if(originalBytes.byteLength!==sourceInfo.size)
        throw Error("Original R2 photo content length did not match metadata");
      const archivedKey=PHOTO_RESET_ARCHIVE_PREFIX+key;
      let archive=await bucket.head(archivedKey);
      if(!archive){
        const copy=await bucket.put(archivedKey,originalBytes,{
          onlyIf:{etagDoesNotMatch:"*"},
          httpMetadata:{
            contentType:source.httpMetadata?.contentType ??
              sourceInfo.httpMetadata?.contentType ?? "application/octet-stream",
          },
        });
        // If another cleanup invocation saved it, verify its content below.
        archive=await bucket.head(archivedKey);
      }
      if(!archive||archive.size!==originalBytes.byteLength)
        throw Error("Template photo archive size verification failed");
      const saved=await bucket.get(archivedKey);
      if(!saved)throw Error("Template photo archive verification read failed");
      const savedBytes=await new Response(saved.body).arrayBuffer();
      if(!equalBytes(originalBytes,savedBytes))
        throw Error("Template photo archive content verification failed");
      if(!bucket.delete)throw Error("R2 photo cleanup requires delete binding");
      await bucket.delete(key);
      if(await bucket.head(key))
        throw Error("Template photo remained after deleting archived original");
      state={...state,copied:state.copied+1,removed:state.removed+1,
        currentPrefix:prefix,updatedAt:timestamp()};
      await writeState(bucket,state);
      budget--;
    }
  }

  // Only record completion when all explicitly scoped namespaces are empty.
  let remaining=0;
  for(const prefix of PHOTO_RESET_PREFIXES){
    const check=await bucket.list({prefix,limit:1});
    remaining+=check.objects.length;
  }
  if(remaining===0){
    state={...state,phase:"completed",currentPrefix:undefined,
      updatedAt:timestamp()};
    await writeState(bucket,state);
  }
  return state;
}
