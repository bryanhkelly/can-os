/** HTTPS-only fallback for ordinary class reading and teacher supplement URLs.
 * Live server writes also require credential-free URLs; this keeps reads safe
 * when older or imported curriculum records were not validated the same way.
 */
export function safeClassExternalHref(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Link-only resources must never render untrusted hrefs or video elements. */
export function SafeClassExternalLink({ url, title, kind, resourceId }: {
  url: string;
  title: string;
  kind: string;
  resourceId?: string;
}) {
  const href = safeClassExternalHref(url);
  return href
    ? <a href={href} data-learning-resource-id={resourceId} target="_blank"
        rel="noopener noreferrer" className="underline">{title} ({kind})</a>
    : <span role="status" className="text-muted-foreground">{title} (external link unavailable)</span>;
}

/** Marketplace supplements may include legacy/imported URLs. No raw hrefs. */
export function SafeExternalOpenLink({ url }: { url: string }) {
  const href = safeClassExternalHref(url);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="ml-1 underline">Open</a>
    : <span role="status" className="ml-1 text-muted-foreground">Link unavailable</span>;
}
