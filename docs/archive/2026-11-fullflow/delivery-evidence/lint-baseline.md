# ESLint Baseline

Captured 2026-11-04 from the current local worktree after excluding generated `.netlify` output.

| Files | Errors | Warnings | Generated Netlify files |
|---:|---:|---:|---:|
| 1,840 | 0 | 281 | 0 |

This is a worktree snapshot, not a commit-pinned `main` baseline. Recount after the current local changes are committed and before raising rule severity.

On PowerShell, reproduce the summary with:

```powershell
$report = npx eslint . --format json | ConvertFrom-Json
[pscustomobject]@{
  Files = $report.Count
  Errors = ($report | Measure-Object -Property errorCount -Sum).Sum
  Warnings = ($report | Measure-Object -Property warningCount -Sum).Sum
  NetlifyGeneratedFiles = ($report | Where-Object { $_.filePath -match '[\\/]\.netlify[\\/]' }).Count
}
```