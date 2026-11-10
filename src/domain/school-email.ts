import { escapePublicHtml } from "./public-site-html";
import { resolveSiteTheme, type SiteTheme } from "./site-theme";
import { siteLocalImageMaxBase64Length } from "./site-local-content";

type EmailBrand = { name: string; theme: SiteTheme; websiteUrl: string | null;
  logo?: { src: string; altText: string } | null };

export function schoolEmailLogoAttachment(brand: EmailBrand | null) {
  const content = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(brand?.logo?.src ?? "")?.[1];
  return content && content.length <= siteLocalImageMaxBase64Length ? {
    filename: "school-logo.png", content, content_type: "image/png", content_id: "school-logo",
  } : null;
}

export function renderSchoolEmail(input: {
  brand: EmailBrand | null; text: string; actionUrl?: string; actionLabel?: string;
}): string {
  const { brand, text, actionUrl, actionLabel = "View update" } = input;
  const theme = brand?.theme ?? resolveSiteTheme();
  const name = escapePublicHtml(brand?.name ?? "CAN OS");
  const safeUrl = (value: string | null | undefined) => {
    if (!value) return null;
    try { return new URL(value).protocol === "https:" ? escapePublicHtml(value) : null; }
    catch { return null; }
  };
  const action = safeUrl(actionUrl);
  const website = safeUrl(brand?.websiteUrl);
  const mark = schoolEmailLogoAttachment(brand)
    ? `<img src="cid:school-logo" alt="${escapePublicHtml(brand?.logo?.altText ?? "")}" width="64" height="64" style="display:inline-block;vertical-align:middle;object-fit:contain;margin-right:12px"/>` : null;
  const initials = escapePublicHtml((brand?.name ?? "CAN OS").split(/\s+/)
    .filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:${theme.canvas};color:${theme.ink};font-family:${escapePublicHtml(theme.bodyFont)}">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px">
<table role="presentation" style="width:100%;max-width:600px;margin:auto;border-collapse:collapse;background:#ffffff">
<tr><td style="padding:24px;border-top:6px solid ${theme.ink};font-family:${escapePublicHtml(theme.displayFont)};font-size:24px;overflow-wrap:anywhere">${mark ?? `<span aria-hidden="true" style="display:inline-block;padding:8px;margin-right:12px;background:${theme.ink};color:#ffffff">${initials}</span>`}${name}</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;overflow-wrap:anywhere">${escapePublicHtml(text).replace(/\r?\n/g, "<br/>")}</td></tr>
${action ? `<tr><td style="padding:0 24px 24px"><a href="${action}" style="display:inline-block;padding:12px 20px;background:${theme.ink};color:#ffffff;text-decoration:none">${escapePublicHtml(actionLabel)}</a></td></tr>` : ""}
${website ? `<tr><td style="padding:16px 24px;border-top:1px solid ${theme.muted}"><a href="${website}" style="color:${theme.ink};overflow-wrap:anywhere">${name}</a></td></tr>` : ""}
</table></td></tr></table></body></html>`;
}