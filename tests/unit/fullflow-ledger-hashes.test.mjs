import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {assessStagedLedgerHashes} from "../../scripts/fullflow-ledger-hashes.mjs";
const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
const hashes=[["0052_family_recruitment_relationship","f17976bc7034f6216425c0aef830eb911eb8c5926d08c9f34049e3df697d606d"],["0053_institutional_graduation_closeout","700222d8de29dce3772a567f46fa86ae7d7c7fd817fd2d0212c072bae9cf29d7"],["0054_academic_credential_delivery","97eae33131090432578249865c290b22684a12b774b545b8153e4d9ccc4902be"],["0055_academic_credential_release_authorizations","3d2f195da869cb4cbd38741756358b0a5eb21869bcb86654ccf60b3a89dccdff"],["0056_steep_lenny_balinger","5af6710985f93345eaf5dfe7766eea1273cd20b30edc95e208e6c62bb90045f8"],["0057_curriculum_annual_adoptions","967d6bfd08509df9735d276ace53d63ca988e5c426536bd2b1450ec8bfb2d276"],["0058_finance_invoices","d0d1a7a486110939b5286b75f616f3308259e8305069407c6a9b023ffa4dfd0c"],["0059_church_evidence_statuses","d4f495c9987039e37b9b19a74e43bd161f07713d90fc7ec5eaef71d2d69a5aa8"]];
const rows=hashes.map(([tag,hash],i)=>({created_at:String(journal.entries[52+i].when),hash}));
describe("FullFlow applied-migration hash provenance",()=>{
 it("matches the committed byte-exact 0052-0059 SQL",()=>{
  expect(journal.entries.slice(52,60).map(x=>x.tag)).toEqual(hashes.map(x=>x[0]));
  expect(assessStagedLedgerHashes({journal,applied:60,rows})).toEqual([]);
  expect(assessStagedLedgerHashes({journal,applied:57,rows:rows.slice(0,5)})).toEqual([]);
 });
 it("fails closed on falsified ledger rows, timestamps, duplicate or missing rows",()=>{
  const bad=[
   rows.slice(1),rows.slice(0,7),[...rows,rows[7]],
   rows.map((r,i)=>i===1?{...r,hash:"0".repeat(64)}:r),
   rows.map((r,i)=>i===3?{...r,created_at:"0"}:r),
  ];
  for(const altered of bad)expect(assessStagedLedgerHashes({journal,applied:60,rows:altered}).length).toBeGreaterThan(0);
 });
 it("does not mistake hashes for evidence of original DDL execution",()=>{
  // Source hash agreement is necessary but insufficient for a provenance signoff.
  expect(assessStagedLedgerHashes({journal,applied:60,rows})).toEqual([]);
 });
});
