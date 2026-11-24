/** Presentation-only contract: all metric calculations belong to authorized domain readers. */
export type ReportChartPoint = { id: string; label: string; value: number | null };
export type ReportChartSpec = {
  title: string; description: string; valueLabel: string;
  kind: "comparison" | "trend"; points: readonly ReportChartPoint[];
  format?: "count" | "decimal" | "percent";
};
export function validateReportChart(spec: ReportChartSpec): boolean {
  if (!spec.title.trim() || !spec.description.trim() || !spec.valueLabel.trim()) return false;
  if (spec.points.length > 60 || new Set(spec.points.map(p => p.id)).size !== spec.points.length) return false;
  return spec.points.every(({id,label,value}) => !!id.trim() && !!label.trim() &&
    (value === null || (Number.isFinite(value) && value >= 0 &&
      ((spec.format ?? "count") !== "count" || Number.isSafeInteger(value)) &&
      (spec.format !== "percent" || value <= 100))));
}
export function formatReportChartValue(value: number | null, format: ReportChartSpec["format"] = "count"): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {maximumFractionDigits: format === "count" ? 0 : 2}).format(value) +
    (format === "percent" ? "%" : "");
}
