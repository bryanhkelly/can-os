/** Arithmetic presentation of two independently sourced counts, not a new domain metric. */
export function compareReportCounts(current:number|null|undefined,prior:number|null|undefined){
  if(typeof current!=="number"||typeof prior!=="number"||!Number.isSafeInteger(current)||
    !Number.isSafeInteger(prior)||current<0||prior<0)return null;
  return {current,prior,change:current-prior};
}
