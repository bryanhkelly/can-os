import { DirectoryTable, StatCard, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import type { AccountHealth } from "@/modules/identity/account-health.server";

export function PlatformAccountHealth({health}:{health:AccountHealth}){
  const totals=health.rows.reduce((acc,row)=>({accounts:acc.accounts+row.accounts,
    grants:acc.grants+row.activeGrants,
    issues:acc.issues+row.missingActivePerson+row.personMismatches+row.scopeMismatches+
      row.unverifiedActiveReal+row.invalidDemoScopes}),{accounts:0,grants:0,issues:0});
  return <WorkspacePanel title="Account Health" className="mt-6"
    description="One identity integrity inventory for all account types. Credential approval and role authorization are separate checks.">
    {health.status==="unavailable"?<WorkspaceNotice tone="attention">
      Account integrity could not be checked. This is not evidence that accounts are healthy.
    </WorkspaceNotice>:<>
      <p className="text-xs text-muted-foreground">Checked {new Date(health.checkedAt).toLocaleString()}. Finding counts may overlap.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Accounts" value={totals.accounts}/>
        <StatCard label="Active grants" value={totals.grants}/>
        <StatCard label="Integrity findings" value={totals.issues}/>
      </div>
      <DirectoryTable label="Account integrity inventory" caption="Aggregate counts by credential classification."
        rows={health.rows} rowKey={row=>row.kind}
        empty={<p className="p-4 text-sm text-muted-foreground">No accounts in the inventory.</p>}
        columns={[
          {id:"kind",title:"Credential",render:row=>row.kind==="demo"?"Demo":"Real"},
          {id:"accounts",title:"Accounts",render:row=>row.accounts},
          {id:"grants",title:"Active grants",render:row=>row.activeGrants},
          {id:"person",title:"Person findings",render:row=>row.missingActivePerson+row.personMismatches},
          {id:"scope",title:"Scope findings",render:row=>row.scopeMismatches+row.invalidDemoScopes},
          {id:"approval",title:"Unverified active real",render:row=>row.unverifiedActiveReal},
          {id:"disabled",title:"Disabled",render:row=>row.disabled},
          {id:"noGrant",title:"No active grants",render:row=>row.noActiveGrants},
        ]}/>
      <WorkspaceNotice className="mt-4">Disabled accounts and accounts awaiting approval can be legitimate. Investigate inconsistencies through authorized identity review; this inventory never restores grants or fabricates evidence.</WorkspaceNotice>
    </>}
  </WorkspacePanel>;
}
