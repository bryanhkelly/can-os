# V6.1 visual acceptance evidence

The strict design audit reads `v61-visual-evidence.json`. An empty review array means **pending**, not passed.

For every path listed under `independentlyReviewedRequired.pending` in `npm run design:coverage`, capture the actual rendered page at mobile, tablet and desktop widths. Check keyboard and focus order, light/dark contrast, 200% zoom, overflow, labels and error announcements. For generated public HTML, use actual rendered Site output, not the source file text.

Save evidence under `docs/verification/screenshots/`. A completed review entry takes this form (illustrative values, not approval):

```json
{
  "path": "src/styles.css",
  "status": "reviewed",
  "reviewer": "person who conducted review",
  "reviewedAt": "2026-11-19T00:00:00Z",
  "sourceSha256": "64 lowercase hex characters from sha256sum src/styles.css",
  "screenshots": [
    { "viewport": "mobile", "path": "docs/verification/screenshots/css-mobile.png" },
    { "viewport": "tablet", "path": "docs/verification/screenshots/css-tablet.png" },
    { "viewport": "desktop", "path": "docs/verification/screenshots/css-desktop.png" }
  ]
}
```

The audit checks source hashes and screenshot existence. Any source change invalidates its review. Browser accessibility, color contrast, authorization and functional acceptance remain separate recorded evidence. Adding a review entry without doing the visual review is prohibited.

For an honest local status read, run `npm run design:coverage`. To require all independent surfaces to be reviewed, run `npm run design:coverage -- --strict`. This strict mode must fail until the ledger contains independently verified current evidence.
