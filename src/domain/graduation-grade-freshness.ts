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
 finalizedAt?:string|null;
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
   if(!UUID.test(row.sectionGradeId.slice("withdrawal:".length)))
    throw new Error("Invalid withdrawal source identity");
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

export type CanonicalWithdrawal = {
 id:string;
 sectionId:string;
 status:string;
 kind:string;
 withdrawalNotation:unknown;
 endedAt:Date|null;
 creditIssuerId:string|null;
 configuredCredits:number|null;
};

/**
 * Withdrawal placeholders are not grades. Their current enrollment source
 * must independently remain withdrawn with the same issuer and W notation.
 * The current record is locked by the caller while preparing disclosure.
 */
export function issuedWithdrawalIds(rows:readonly IssuedGradeSnapshot[]):string[]{
 issuedGradeIds(rows); // shared format, duplicate grade, and W-credit validation
 const ids=rows.filter(row=>typeof row.sectionGradeId==="string"&&row.sectionGradeId.startsWith("withdrawal:"))
   .map(row=>(row.sectionGradeId as string).slice("withdrawal:".length));
 if(new Set(ids).size!==ids.length)throw new Error("Duplicate withdrawal source identity");
 return ids;
}

export function assertIssuedWithdrawalsStillCanonical(
 rows:readonly IssuedGradeSnapshot[],current:readonly CanonicalWithdrawal[],issuerId:string,
):void{
 const ids=issuedWithdrawalIds(rows);
 const known=new Map(current.map(row=>[row.id,row]));
 if(known.size!==current.length)throw new Error("Duplicate canonical withdrawal identity");
 for(const row of rows){
  if(typeof row.sectionGradeId!=="string"||!row.sectionGradeId.startsWith("withdrawal:"))continue;
  const id=row.sectionGradeId.slice("withdrawal:".length);
  const source=known.get(id);
  if(!source || source.kind!=="section" || source.status!=="withdrawn" ||
     source.sectionId!==row.sectionId || source.creditIssuerId!==issuerId ||
     source.withdrawalNotation!=="W")
    throw new Error("Issued withdrawal notation no longer matches canonical enrollment");
  if(row.finalizedAt!==source.endedAt?.toISOString() &&
     !(row.finalizedAt===null && source.endedAt===null))
    throw new Error("Issued withdrawal was revised after transcript issuance");
  if(!Object.prototype.hasOwnProperty.call(row,"creditsAttempted") ||
     source.configuredCredits!==(row.creditsAttempted??null))
    throw new Error("Withdrawal credit configuration changed");
 }
}
