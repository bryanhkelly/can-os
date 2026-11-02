import { describe, it, expect } from "vitest";
import { assessPost0056MigrationArtifacts, lateMigrationSpec } from "../../scripts/fullflow-post0051-artifacts.mjs";
const spec=lateMigrationSpec;
const rows={
 tables:Object.keys(spec).map(table_name=>({table_name})),
 lateColumns:Object.entries(spec).flatMap(([table_name,v])=>v.cols.map(c=>({table_name,column_name:c.name,data_type:c.type,is_nullable:c.required?"NO":"YES"}))),
 lateIndexes:Object.entries(spec).flatMap(([tablename,v])=>v.indexes.map(i=>({tablename,indexname:i.name,indexdef:`CREATE ${i.unique?"UNIQUE ":""}INDEX ${i.name} ON public.${tablename} USING btree (${i.cols.join(", ")})`}))),
 lateForeignKeys:Object.entries(spec).flatMap(([table_name,v])=>v.fks.map(f=>({table_name,column_name:f.column,referenced_table:f.target,on_delete:"r"}))),
 latePrimaryKeys:Object.keys(spec).map(table_name=>({table_name,column_name:"id"})),
};
const status=(values)=>[{conname:"church_onboarding_request_status_ck",
 definition:`CHECK ((status = ANY (ARRAY[${values.map(x=>`'${x}'::text`).join(", ")}])))`}];
const old=["submitted","verified","approved","declined"], newer=[...old,"needs_evidence","canceled"];
const subset=names=>({
 tables:rows.tables.filter(x=>names.includes(x.table_name)),
 lateColumns:rows.lateColumns.filter(x=>names.includes(x.table_name)),
 lateIndexes:rows.lateIndexes.filter(x=>names.includes(x.tablename)),
 lateForeignKeys:rows.lateForeignKeys.filter(x=>names.includes(x.table_name)),
 latePrimaryKeys:rows.latePrimaryKeys.filter(x=>names.includes(x.table_name)),
});
const check=assessPost0056MigrationArtifacts;
describe("FullFlow 0057-0059 schema and ledger-stage agreement",()=>{
 it("accepts exact 0056 -> 0057 -> 0058 -> 0059 catalog progression",()=>{
  for(const [stage,names,values] of [
   [57,[],old],[58,["curriculum_annual_adoptions"],old],
   [59,Object.keys(spec),old],[60,Object.keys(spec),newer]]) {
    expect(check({stage,...subset(names),churchStatusConstraints:status(values)})).toEqual([]);
  }
 });
 it("rejects objects before migration and 0059 status before its own ledger row",()=>{
  expect(check({stage:57,...rows,churchStatusConstraints:status(old)}).some(x=>x.includes("ahead"))).toBe(true);
  expect(check({stage:59,...rows,churchStatusConstraints:status(newer)}).some(x=>x.includes("0059"))).toBe(true);
 });
 it("rejects missing or partial schema, indexes, keys and changed definitions",()=>{
  const base={stage:60,...rows,churchStatusConstraints:status(newer)};
  const bad=[
   {...base,tables:rows.tables.slice(1)},
   {...base,lateColumns:rows.lateColumns.filter(x=>x.column_name!=="entitlement_id")},
   {...base,lateColumns:rows.lateColumns.map(x=>x.column_name==="amount_cents"?{...x,is_nullable:"YES"}:x)},
   {...base,lateIndexes:rows.lateIndexes.filter(x=>x.indexname!=="finance_provider_event_uq")},
   {...base,lateIndexes:rows.lateIndexes.map(x=>x.indexname==="finance_invoice_obligation_uq"?{...x,indexdef:x.indexdef.replace("UNIQUE ","")}:x)},
   {...base,lateForeignKeys:rows.lateForeignKeys.filter(x=>x.column_name!=="invoice_id")},
   {...base,latePrimaryKeys:rows.latePrimaryKeys.slice(1)},
   {...base,churchStatusConstraints:status(old)},
  ];
  for(const item of bad)expect(check(item).length).toBeGreaterThan(0);
 });
});
