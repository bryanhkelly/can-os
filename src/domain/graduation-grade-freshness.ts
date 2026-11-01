/**
 * Conservative canonical-grade freshness for immutable transcript snapshots.
 * Grade corrections mutate the finalized row in place, so a previously issued
 * snapshot must be reviewed, even when its original grade happens to match.
 */
export type IssuedGradeSnapshot = {
 sectionGradeId?:unknown;
 sectionId:string;
 letterGrade:string|null;
 terminalPeriod:boolean;
 creditsAttempted?:number|null;
 creditsEarned:number|null;
};
export type CanonicalGrade = {
 id:string;
 sectionId:string;
 letterGrade:string|null;
 status:string;
 updatedAt:Date;
 creditIssuerId:string|null;
 configuredCredits:number|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns required grade IDs; throws if a historical snapshot is unverifiable. */
export function issuedGradeIds(rows:readonly IssuedGradeSnapshot[]):string[]{
 const ids:string[]=[];
 for(const row of rows){
  if(typeof row.sectionGradeId!=="string")throw new Error("Transcript grade provenance missing");
  if(row.sectionGradeId.startsWith("withdrawal:")){
   if(row.letterGrade?.trim().toUpperCase()!=="W" || (row.creditsEarned??0)!==0)
    throw new Error("Malformed withdrawal evidence");
   continue;
  }
  if(!UUID.test(row.sectionGradeId))throw new Error("Invalid transcript grade identity");
  ids.push(row.sectionGradeId);
 }
 if(new Set(ids).size!==ids.length)throw new Error("Duplicate transcript grade identity");
 return ids;
}

export function assertIssuedGradesStillCanonical(
 snapshots:readonly IssuedGradeSnapshot[],
 current:readonly CanonicalGrade[],
 issuedAt:Date,
 issuerId:string,
):void{
 const ids=issuedGradeIds(snapshots);
 const known=new Map(current.map(row=>[row.id,row]));
 if(known.size!==current.length)throw new Error("Duplicate canonical grade identity");
 for(const row of snapshots){
  if(typeof row.sectionGradeId==="string"&&row.sectionGradeId.startsWith("withdrawal:"))continue;
  const canonical=known.get(row.sectionGradeId as string);
  if(!canonical||canonical.sectionId!==row.sectionId||canonical.status!=="finalized"||
    canonical.creditIssuerId!==issuerId||canonical.letterGrade!==row.letterGrade)
   throw new Error("Issued grade no longer matches canonical academic records");
  if(!Number.isFinite(canonical.updatedAt.getTime())||canonical.updatedAt>issuedAt)
   throw new Error("Issued transcript predates a canonical grade correction");
  if(row.terminalPeriod){
   if(!Object.prototype.hasOwnProperty.call(row,"creditsAttempted")||
      canonical.configuredCredits!==(row.creditsAttempted??null))
    throw new Error("Section credit configuration changed after transcript issuance");
  }
 }
}
