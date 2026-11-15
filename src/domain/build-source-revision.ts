/** Git commit embedded by Vite at build time. Never infer this from runtime
 * env or assert a deployed SHA just because main was pushed. */
declare const __CAN_SOURCE_REVISION__: string | null;
export function embeddedSourceRevision():string|null {
  const raw=typeof __CAN_SOURCE_REVISION__==="undefined"?null:__CAN_SOURCE_REVISION__;
  return typeof raw==="string"&&/^[a-f0-9]{40}$/i.test(raw)?raw.toLowerCase():null;
}
