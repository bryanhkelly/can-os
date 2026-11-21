/**
 * One source-safe CSV serializer for private reporting exports.
 * Spreadsheet clients can evaluate formulas from quoted text fields.
 * Prefix potentially executable text with an apostrophe before quoting.
 *
 * Access control and data minimization remain the caller's responsibility.
 */
export type ReportingCsvValue = string | number | null | undefined;

const DANGEROUS_FORMULA_START = /^[\u0000-\u0020\u00a0\ufeff]*[=+\-@]/u;

export function reportingCsvCell(value: ReportingCsvValue): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Reporting CSV cannot export a non-finite number");
  }
  const raw = value === null || value === undefined ? "Unavailable" : String(value);
  const safe = typeof value === "string" && DANGEROUS_FORMULA_START.test(raw)
    ? "'" + raw
    : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function reportingCsvRow(values: readonly ReportingCsvValue[]): string {
  return values.map(reportingCsvCell).join(",");
}
