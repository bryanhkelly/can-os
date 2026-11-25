import type { GoExperience } from "@/modules/engagement/engagement-go.server";

const escape=(value:string):string=>value
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#39;");
const labels={
  information:"Learn more",
  invitation:"You're invited",
  opportunity:"Explore an opportunity",
} as const;

/** Fixed, accessible output. Only parsed, immutable plain-text content is interpolated. */
export function renderEngagementPage(experience:Extract<GoExperience,{mode:"page"}>):string{
  const {definition,ownerName,href}=experience;
  const execution=definition.execution;
  if(execution.mode!=="page")throw new Error("Only page engagements may be rendered");
  const title=escape(definition.presentation.headline);
  const summary=escape(definition.presentation.summary);
  const detail=definition.presentation.detail
    ? `<p class="detail">${escape(definition.presentation.detail)}</p>`:"";
  const caption=escape(labels[execution.template]);
  const owner=escape(ownerName);
  // Brand comes exclusively from the finite, contrast-reviewed Site theme registry.
  // Never interpolate user-provided CSS, URLs, fonts or image assets.
  return renderPublicEngagementDocument({title,summary,detail,caption,owner,href,actionLabel:execution.actionLabel,theme:experience.theme});
}

/** A public link failure never accepts owner or link identity as input. */
export function renderUnavailableEngagementPage(status:404|503):string {
  return renderPublicEngagementDocument({
    title:status===404?"This link is no longer available":"This link is temporarily unavailable",
    summary:status===404?"The invitation may have expired or the opportunity may no longer be shared.":"We could not open this invitation. You can explore other opportunities.",
    detail:"",caption:"Shared link",owner:"Becomuna",href:"/landing",actionLabel:"Explore current opportunities",
    unavailable:true,
  });
}

/** Shared square-corner, responsive public HTML shell. No external asset requests. */
function renderPublicEngagementDocument({title,summary,detail,caption,owner,href,actionLabel,theme,unavailable=false}:{
  title:string;summary:string;detail:string;caption:string;owner:string;href:string;actionLabel:string;
  theme?:Extract<GoExperience,{mode:"page"}>["theme"];unavailable?:boolean;
}):string {
  const ink=theme?.ink??"#152332";
  const canvas=theme?.canvas??"#f8f8f6";
  const muted=theme?.muted??"#3f4d59";
  const surface=theme?.surface??"#ffffff";
  const headingFont=theme?.displayFont??'"Instrument Serif", Georgia, serif';
  const bodyFont=theme?.bodyFont??'"DM Sans", system-ui, -apple-system, Segoe UI, sans-serif';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title} | ${owner}</title>
  <style>
    :root{color-scheme:light;font-family:${bodyFont};
      color:${ink};background:${canvas}}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;overflow-wrap:anywhere}
    header{padding:24px max(24px,calc((100vw - 1000px)/2));border-bottom:1px solid #e3e6e8;
      background:${surface};font-weight:600;letter-spacing:normal}
    main{max-width:780px;margin:0 auto;padding:clamp(42px,7vw,92px) 24px}
    .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:600;color:${muted}}
    h1{font-family:${headingFont};font-size:clamp(38px,5vw,60px);font-weight:400;
      letter-spacing:normal;line-height:1.09;margin:20px 0 25px}
    .summary{font-size:19px;line-height:1.65;color:${muted};white-space:pre-line}
    .detail{font-size:16px;line-height:1.75;color:${muted};white-space:pre-line;margin:22px 0}
    .action{display:inline-flex;align-items:center;min-height:44px;max-width:100%;margin-top:28px;padding:12px 20px;border-radius:0;
      background:${ink};color:white;text-decoration:none;font-weight:600}
    .action:hover{text-decoration:underline;text-underline-offset:4px}
    .note{font-size:13px;color:${muted};margin-top:30px;line-height:1.6}
    a:focus-visible{outline:3px solid ${ink};outline-offset:3px}
    footer{border-top:1px solid #e3e6e8;margin-top:40px;padding:24px;text-align:center;
      font-size:12px;color:${muted}}
  </style>
</head>
<body>
<header>${owner}</header>
<main>
  <div class="eyebrow">${caption}</div>
  <h1>${title}</h1>
  <p class="summary">${summary}</p>
  ${detail}
  <a class="action" href="${escape(href)}">${escape(actionLabel)}</a>
  ${unavailable?"":'<p class="note">An inquiry, application, registration or other action is not complete until you finish the next step.</p>'}
</main>
<footer>Powered by Becomuna</footer>
</body>
</html>`;
}
