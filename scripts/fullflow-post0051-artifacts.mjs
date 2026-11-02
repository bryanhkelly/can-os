/** Read-only 0060 destructive-column precondition and ledger consistency guard. */
export function assessTenantDemoColumnRemoval({stage,accountGrantColumns=[]}) {
 const column=accountGrantColumns.find(row=>row.column_name==="is_synthetic");
 if(stage>=61)
  return column?["0060: is_synthetic exists after its column-drop migration; HOLD manual reconciliation"]:[];
 if(!column)
  return ["0060: is_synthetic missing ahead of migration ledger; HOLD manual reconciliation"];
 if(column.data_type!=="boolean"||column.is_nullable!=="NO")
  return ["0060: is_synthetic definition changed; HOLD review before destructive DDL"];
 return [];
}

/** Read-only 0052–0056 schema/ledger consistency guard.
 * A pre-existing table does NOT establish a completed Drizzle migration. */
const rules=[
 {tag:"0052 family recruitment",stage:53,
  columns:["contact_consent_at","source","invitation_batch_id",
    "invitation_recipient_key","family_start_request_id"],
  indexes:["public_admissions_interests_invited_recipient_uq",
    "public_admissions_interests_family_start_idx"]},
 {tag:"0053 graduation",stage:54,
  tables:["graduation_requirement_sets","graduation_decisions","diploma_issuances"],
  indexes:["graduation_decision_student_idx"]},
 {tag:"0054 credential delivery",stage:55,
  tables:["academic_credential_deliveries"],
  indexes:["academic_delivery_issuer_idx","academic_delivery_status_idx"]},
 {tag:"0055 credential release",stage:56,
  tables:["academic_credential_release_authorizations"],
  indexes:["academic_release_issuer_idx","academic_release_recipient_idx"]},
 {tag:"0056 cohort",stage:57,
  cohortColumns:["cohort_start","cohort_end","supersedes_requirement_set_id","applicability_reason"],
  indexes:["graduation_requirement_superseded_once_uq","graduation_requirement_cohort_lookup_idx"],
  constraints:["graduation_cohort_bounds_ck","graduation_supersession_not_self_ck",
    "graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk"]},
];
export function assessPost0051MigrationArtifacts({
 stage,tables=[],relationshipColumns=[],futureIndexes=[],cohortColumns=[],cohortConstraints=[],
}){
 const present={
  table:new Set(tables.map(x=>x.table_name)),
  column:new Set(relationshipColumns.map(x=>x.column_name)),
  index:new Set(futureIndexes.map(x=>x.indexname)),
  cohortColumn:new Set(cohortColumns.map(x=>x.column_name)),
  constraint:new Set(cohortConstraints.map(x=>x.conname.slice(0,63))),
 };
 const issues=[];
 for(const rule of rules){
  const applied=stage>=rule.stage;
  for(const [kind,fields] of [
   ["table",rule.tables??[]],["column",rule.columns??[]],
   ["index",rule.indexes??[]],["cohortColumn",rule.cohortColumns??[]],
   ["constraint",rule.constraints??[]],
  ]){
   for(const name of fields){
    // PostgreSQL truncates these ASCII identifiers to NAMEDATALEN - 1 bytes.
    const exists=present[kind].has(kind==="constraint"?name.slice(0,63):name);
    if(applied&&!exists)issues.push(`${rule.tag}: applied ${kind} missing: ${name}`);
    if(!applied&&exists)issues.push(`${rule.tag}: ${kind} exists ahead of migration ledger: ${name}; HOLD manual reconciliation`);
   }
  }
 }
 return issues;
}

/** Verified 0057/0058 SQL catalog requirements, not inferred from the ledger.
 * 0059 changes the 0051 church status constraint in-place. */
export const lateMigrationSpec = {
  "curriculum_annual_adoptions": {
    "cols": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "organization_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "program_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "site_id",
        "type": "uuid",
        "required": false
      },
      {
        "name": "academic_provider_organization_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "academic_year_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "pack_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "pack_version_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "entitlement_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "status",
        "type": "text",
        "required": true
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "required": false
      },
      {
        "name": "created_by_person_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true
      }
    ],
    "fks": [
      {
        "column": "organization_id",
        "target": "organizations"
      },
      {
        "column": "program_id",
        "target": "programs"
      },
      {
        "column": "site_id",
        "target": "sites"
      },
      {
        "column": "academic_provider_organization_id",
        "target": "organizations"
      },
      {
        "column": "academic_year_id",
        "target": "school_years"
      },
      {
        "column": "pack_id",
        "target": "curriculum_packs"
      },
      {
        "column": "pack_version_id",
        "target": "curriculum_pack_versions"
      },
      {
        "column": "entitlement_id",
        "target": "curriculum_entitlements"
      },
      {
        "column": "created_by_person_id",
        "target": "people"
      }
    ],
    "indexes": [
      {
        "name": "curriculum_annual_adoption_program_year_pack_uq",
        "unique": true,
        "cols": [
          "program_id",
          "academic_year_id",
          "pack_id"
        ]
      },
      {
        "name": "curriculum_annual_adoption_org_year_idx",
        "unique": false,
        "cols": [
          "organization_id",
          "academic_year_id"
        ]
      }
    ]
  },
  "finance_invoices": {
    "cols": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "obligation_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "application_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "household_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "institution_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "site_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "collector",
        "type": "text",
        "required": true
      },
      {
        "name": "provider",
        "type": "text",
        "required": false
      },
      {
        "name": "processor_account_id",
        "type": "text",
        "required": false
      },
      {
        "name": "policy_version",
        "type": "text",
        "required": true
      },
      {
        "name": "amount_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "currency",
        "type": "text",
        "required": true
      },
      {
        "name": "captured_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "refunded_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "chargeback_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "provider_payment_id",
        "type": "text",
        "required": false
      },
      {
        "name": "church_share_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "can_share_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "due_at",
        "type": "timestamp with time zone",
        "required": false
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "required": true
      }
    ],
    "fks": [
      {
        "column": "obligation_id",
        "target": "financial_obligations"
      },
      {
        "column": "application_id",
        "target": "applications"
      },
      {
        "column": "household_id",
        "target": "households"
      },
      {
        "column": "institution_id",
        "target": "organizations"
      },
      {
        "column": "site_id",
        "target": "sites"
      }
    ],
    "indexes": [
      {
        "name": "finance_invoice_obligation_uq",
        "unique": true,
        "cols": [
          "obligation_id"
        ]
      },
      {
        "name": "finance_invoice_institution_site_idx",
        "unique": false,
        "cols": [
          "institution_id",
          "site_id"
        ]
      },
      {
        "name": "finance_invoice_household_idx",
        "unique": false,
        "cols": [
          "household_id"
        ]
      },
      {
        "name": "finance_invoice_application_idx",
        "unique": false,
        "cols": [
          "application_id"
        ]
      }
    ]
  },
  "finance_payment_attempts": {
    "cols": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "idempotency_key",
        "type": "text",
        "required": true
      },
      {
        "name": "provider",
        "type": "text",
        "required": true
      },
      {
        "name": "provider_intent_id",
        "type": "text",
        "required": false
      },
      {
        "name": "amount_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "status",
        "type": "text",
        "required": true
      },
      {
        "name": "error_code",
        "type": "text",
        "required": false
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "required": true
      }
    ],
    "fks": [
      {
        "column": "invoice_id",
        "target": "finance_invoices"
      }
    ],
    "indexes": [
      {
        "name": "finance_attempt_idempotency_uq",
        "unique": true,
        "cols": [
          "invoice_id",
          "idempotency_key"
        ]
      },
      {
        "name": "finance_attempt_invoice_idx",
        "unique": false,
        "cols": [
          "invoice_id"
        ]
      }
    ]
  },
  "finance_provider_events": {
    "cols": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "provider",
        "type": "text",
        "required": true
      },
      {
        "name": "event_id",
        "type": "text",
        "required": true
      },
      {
        "name": "event_kind",
        "type": "text",
        "required": true
      },
      {
        "name": "provider_payment_id",
        "type": "text",
        "required": true
      },
      {
        "name": "provider_refund_id",
        "type": "text",
        "required": false
      },
      {
        "name": "amount_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "currency",
        "type": "text",
        "required": true
      },
      {
        "name": "verified_at",
        "type": "timestamp with time zone",
        "required": true
      },
      {
        "name": "evidence",
        "type": "jsonb",
        "required": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "required": true
      }
    ],
    "fks": [
      {
        "column": "invoice_id",
        "target": "finance_invoices"
      }
    ],
    "indexes": [
      {
        "name": "finance_provider_event_uq",
        "unique": true,
        "cols": [
          "provider",
          "event_id"
        ]
      },
      {
        "name": "finance_refund_identity_uq",
        "unique": true,
        "cols": [
          "provider",
          "provider_refund_id"
        ]
      },
      {
        "name": "finance_provider_invoice_idx",
        "unique": false,
        "cols": [
          "invoice_id",
          "created_at"
        ]
      }
    ]
  },
  "finance_receipts": {
    "cols": [
      {
        "name": "id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "provider_event_id",
        "type": "uuid",
        "required": true
      },
      {
        "name": "kind",
        "type": "text",
        "required": true
      },
      {
        "name": "amount_cents",
        "type": "integer",
        "required": true
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "required": true
      }
    ],
    "fks": [
      {
        "column": "invoice_id",
        "target": "finance_invoices"
      },
      {
        "column": "provider_event_id",
        "target": "finance_provider_events"
      }
    ],
    "indexes": [
      {
        "name": "finance_receipt_event_uq",
        "unique": true,
        "cols": [
          "provider_event_id"
        ]
      },
      {
        "name": "finance_receipt_invoice_idx",
        "unique": false,
        "cols": [
          "invoice_id"
        ]
      }
    ]
  }
};
const annualTables = ["curriculum_annual_adoptions"];
const financeTables = ["finance_invoices","finance_payment_attempts","finance_provider_events","finance_receipts"];
const oldStatuses = ["approved","declined","submitted","verified"];
const newStatuses = [...oldStatuses,"canceled","needs_evidence"].sort();

/** Validate already-applied schema AND reject any artifact ahead of the ledger. */
export function assessPost0056MigrationArtifacts({
 stage, tables=[], lateColumns=[], lateIndexes=[], lateForeignKeys=[],
 latePrimaryKeys=[], churchStatusConstraints=[],
}) {
 const issues=[];
 const found=new Set(tables.map(x=>x.table_name));
 const cols=new Map(lateColumns.map(x=>[x.table_name+"."+x.column_name,x]));
 const indexes=new Map(lateIndexes.map(x=>[x.tablename+"."+x.indexname,x]));
 const fks=new Set(lateForeignKeys.map(x=>[x.table_name,x.column_name,x.referenced_table,x.on_delete].join(".")));
 const pks=new Set(latePrimaryKeys.map(x=>x.table_name+"."+x.column_name));
 for(const {tag,at,names} of [
  {tag:"0057 annual curriculum",at:58,names:annualTables},
  {tag:"0058 finance",at:59,names:financeTables},
 ]) for(const name of names) {
   const applied=stage>=at, rule=lateMigrationSpec[name];
   if(applied&&!found.has(name))issues.push(tag+": table missing: "+name);
   if(!applied&&found.has(name))issues.push(tag+": table ahead of ledger: "+name);
   for(const col of rule.cols) {
     const row=cols.get(name+"."+col.name);
     if(!applied&&row)issues.push(tag+": column ahead of ledger: "+name+"."+col.name);
     if(applied&&!row)issues.push(tag+": column missing: "+name+"."+col.name);
     else if(applied&&(row.data_type!==col.type||(row.is_nullable==="NO")!==col.required))
       issues.push(tag+": column mismatch: "+name+"."+col.name);
   }
   for(const idx of rule.indexes) {
     const row=indexes.get(name+"."+idx.name);
     if(!applied&&row)issues.push(tag+": index ahead of ledger: "+idx.name);
     if(applied&&!row)issues.push(tag+": index missing: "+idx.name);
     else if(applied) {
       const definition=String(row.indexdef??"");
       const unique=/^CREATE UNIQUE INDEX\b/.test(definition);
       const actual=/USING btree \(([^)]+)\)/.exec(definition)?.[1]
         .split(",").map(x=>x.trim().replaceAll('"',""))??[];
       if(unique!==idx.unique||actual.join("|")!==idx.cols.join("|"))
         issues.push(tag+": index definition mismatch: "+idx.name);
     }
   }
   for(const fk of rule.fks) {
     const match=fks.has([name,fk.column,fk.target,"r"].join("."));
     if(applied&&!match)issues.push(tag+": RESTRICT foreign key missing: "+name+"."+fk.column);
     if(!applied&&match)issues.push(tag+": foreign key ahead of ledger: "+name+"."+fk.column);
   }
   const pk=pks.has(name+".id");
   if(applied&&!pk)issues.push(tag+": primary key missing: "+name);
   if(!applied&&pk)issues.push(tag+": primary key ahead of ledger: "+name);
 }
 const status=churchStatusConstraints.find(x=>x.conname==="church_onboarding_request_status_ck");
 if(stage<52&&status)issues.push("0051 church status constraint ahead of ledger");
 if(stage>=52) {
   if(!status)issues.push("0051/0059 church status constraint missing");
   else {
     const def=String(status.definition??"");
     const actual=[...def.matchAll(/'([^']+)'/g)].map(x=>x[1]).sort();
     const wanted=stage>=60?newStatuses:oldStatuses;
     if(!/^CHECK\b/.test(def)||!def.includes("status")||actual.join("|")!==wanted.join("|"))
       issues.push(stage>=60?"0059 church status definition mismatch":
         "0059 church status ahead of ledger or old 0051 constraint drift");
   }
 }
 return issues;
}
