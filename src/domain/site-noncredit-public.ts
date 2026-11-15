/** Approved canonical noncredit training that belongs to a separately linked Site.
 * This projection has no participant identity, private consent text or roster. */
export type SiteNoncreditListing={
  releaseId:string;
  title:string;
  siteName:string;
  seatsRemaining:number;
  waitlistAvailable:boolean;
};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
})[c]!);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Existing CAN sign-in origin, never the tenant Site Host. */
export function noncreditEnrollmentOrigin(raw:string|undefined|null):string|null {
  if(!raw)return null;
  try{
    const u=new URL(raw);
    if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
       u.pathname!=="/")return null;
    return u.origin;
  }catch{return null;}
}

/** No speculative or disabled Register buttons. A verified noncredit release
 * still authorizes enrollment only through its existing final POST checks. */
export function renderSiteNoncreditOfferings(
  releases:readonly SiteNoncreditListing[],
  appOrigin:string|null|undefined,
):string {
  if(!releases.length)return "";
  const origin=noncreditEnrollmentOrigin(appOrigin);
  const items=releases.filter(x=>uuid.test(x.releaseId)).map(x=>{
    const title=esc(x.title);
    const spots=x.seatsRemaining>0?"Enrollment available":
      x.waitlistAvailable?"Waitlist available":"Registration not available";
    const cta=origin && (x.seatsRemaining>0||x.waitlistAvailable)
      ? `<a class="site-noncredit-link" href="${esc(origin+"/learn/enroll?release="+encodeURIComponent(x.releaseId))}">${x.seatsRemaining>0?"Register for this course":"Join the waitlist"}</a>`
      : `<span class="site-noncredit-pending">${origin?"Registration unavailable":"Visit CAN OS to register"}</span>`;
    return `<article class="site-noncredit-card"><span class="site-noncredit-tag">APPROVED NONCREDIT TRAINING</span>
      <h3>${title}</h3><p>${esc(spots)}</p>${cta}</article>`;
  }).join("");
  if(!items)return "";
  return `<section class="site-noncredit-section" aria-label="Available training">
    <div class="site-noncredit-heading"><span>TRAINING &amp; LEARNING</span><h2>Programs available for enrollment</h2></div>
    <div class="site-noncredit-grid">${items}</div>
    </section><style>
    .site-noncredit-section{padding:30px 0;border-top:1px solid #d8e0e8;margin:44px 0}
    .site-noncredit-heading>span,.site-noncredit-tag{font:700 11px/1.6 Arial,sans-serif;letter-spacing:.09em;color:#185cb0}
    .site-noncredit-section h2{font-family:Georgia,serif;font-size:clamp(1.7rem,3vw,2.5rem);margin:8px 0 24px}
    .site-noncredit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:15px}
    .site-noncredit-card{border:1px solid #d8e0e8;padding:24px;border-radius:0;background:#fff;color:#12223d}
    .site-noncredit-card h3{font:600 20px/1.35 Arial,sans-serif;margin:13px 0 9px}
    .site-noncredit-card p{font:400 14px/1.6 Arial,sans-serif;color:#52637c}
    .site-noncredit-link{display:inline-flex;padding:12px 16px;margin-top:13px;background:#155df1;color:#fff!important;font:700 13px/1.4 Arial,sans-serif;text-decoration:none}
    .site-noncredit-pending{display:inline-block;margin-top:14px;font:600 12px/1.6 Arial,sans-serif;color:#56657c}
    </style>`;
}
