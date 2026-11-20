import type { MarketingPackageContent } from "./marketing-package-v61";

/** A working package is mutable. A Package Release owns a frozen set of outputs. */
export type PackageReleaseReferenceV61 = {
  brandVersionId:string;
  title:string;
  content:MarketingPackageContent;
  outputs:readonly {format:string;withdrawnAt:string|null}[];
  complete:boolean;
};
export type PackageWorkingStateV61 = {
  brandVersionId:string|null;
  title:string;
  content:MarketingPackageContent;
};
export type PackageChangeV61="brand"|"message"|"audiences"|"formats"|"details";

/** Compare the actual snapshot, not DB revision counters or a mutable website. */
export function packageReleaseChangesV61(
  working:PackageWorkingStateV61,latest:PackageReleaseReferenceV61|null,
):PackageChangeV61[]{
  if(!latest)return [];
  const changes:PackageChangeV61[]=[];
  if(working.brandVersionId!==latest.brandVersionId)changes.push("brand");
  if(working.content.headline!==latest.content.headline ||
     working.content.message!==latest.content.message ||
     working.content.callToAction!==latest.content.callToAction)changes.push("message");
  const sameSet=(a:readonly string[],b:readonly string[])=>
    a.length===b.length && a.every(value=>b.includes(value));
  if(!sameSet(working.content.audiences,latest.content.audiences))changes.push("audiences");
  if(!sameSet(working.content.formats,latest.content.formats))changes.push("formats");
  if(working.title!==latest.title ||
    working.content.geography!==latest.content.geography ||
    working.content.purpose!==latest.content.purpose)changes.push("details");
  return changes;
}
export function packageReleaseIsDownloadableV61(
  release:PackageReleaseReferenceV61,
):boolean{
  const expected=release.content.formats;
  const actual=release.outputs.map(output=>output.format);
  // Count parity alone is insufficient: a broken or duplicate projection
  // could otherwise let a complete ZIP omit an intended format and include
  // a second copy of another. Fail closed until the server history is fixed.
  return release.complete && expected.length>0 && actual.length===expected.length &&
    new Set(expected).size===expected.length && new Set(actual).size===actual.length &&
    expected.every(format=>actual.includes(format)) &&
    release.outputs.every(output=>!output.withdrawnAt);
}
