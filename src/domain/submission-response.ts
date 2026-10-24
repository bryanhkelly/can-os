/** Preserve separately verified files when the student edits response text.
 * Draft autosave and final submission must not erase attachments recorded by
 * the canonical private-document workflow. A new revision is a new attempt
 * and intentionally does not inherit the previous attempt's files.
 */
export function writtenSubmissionResponse(
  prior: Record<string, unknown> | null | undefined,
  text: string,
  draft = false,
): Record<string, unknown> {
  const attachments = Array.isArray(prior?.attachments)
    ? prior.attachments.filter((value): value is string =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    : [];
  return {
    text,
    ...(draft ? { draft: true } : {}),
    ...(attachments.length ? { attachments: [...new Set(attachments)] } : {}),
  };
}
