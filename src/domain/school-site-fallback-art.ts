/**
 * CAN School Sites — original, deterministic, illustration-first fallback media.
 *
 * 24 bundled artworks = 3 visual families × 8 slots. These are illustrative
 * abstract editorial graphics, NOT photographs of a school's actual people,
 * facilities, programs or events. No Unsplash or third-party rights assumed.
 *
 * Content is generated only from finite enums; SVG text/script/foreignObject
 * and external fetches are never accepted or rendered.
 */
export const canFallbackFamilies = ["heritage","natural","harbor"] as const;
export type CanFallbackFamily = (typeof canFallbackFamilies)[number];
export const canFallbackSlots = [
  "hero","about","academics","student-life","campus","families","reflection","details",
] as const;
export type CanFallbackSlot = (typeof canFallbackSlots)[number];
export type CanFallbackArtwork = {id:string;family:CanFallbackFamily;slot:CanFallbackSlot;
  src:string;alt:string;attribution:"CAN original abstract illustration";};

const colors:Record<CanFallbackFamily,{dark:string;mid:string;gold:string;light:string;veil:string}> = {
  heritage:{dark:"#14273e",mid:"#3a4f60",gold:"#c59a58",light:"#f5eedf",veil:"#e3d4b4"},
  natural:{dark:"#153c35",mid:"#567963",gold:"#c9b07b",light:"#f1f4e8",veil:"#b0c7a7"},
  harbor:{dark:"#4f1c31",mid:"#9f6777",gold:"#dbb2a7",light:"#fbf4f1",veil:"#e8c3c6"},
};
const slotIndex:Record<CanFallbackSlot,number> = {
  hero:0,about:1,academics:2,"student-life":3,campus:4,families:5,reflection:6,details:7,
};

/** CSS-free, no external sources, no markup assembled from uploaded content. */
function illustrationSvg(family:CanFallbackFamily,slot:CanFallbackSlot):string {
  const palette=colors[family],index=slotIndex[slot];
  const shift=index*37;
  const horizon=480+(index%3)*40;
  const frame=1600-((index%4)*65);
  const circleX=1160-index*47;
  const circleY=235+(index%4)*52;
  const ridges=Array.from({length:6},(_,i)=>{
    const x=-180+i*330+shift%100;
    const y=horizon+(i%3)*50;
    return `<path d="M ${x} 960 L ${x+250} ${y} L ${x+510} 960Z" fill="${i%2?palette.mid:palette.dark}" opacity="${(0.28+i*.045).toFixed(2)}"/>`;
  }).join("");
  const panels=Array.from({length:5},(_,i)=>{
    const x=110+i*265+(index%2)*30,y=140+(i%3)*52;
    return `<rect x="${x}" y="${y}" width="${165+(i%2)*40}" height="${320-(i%3)*40}" rx="3" stroke="${palette.light}" stroke-width="2" opacity=".15"/>`;
  }).join("");
  const emblem=index%3===0
    ? `<circle cx="${circleX}" cy="${circleY}" r="230" fill="none" stroke="${palette.light}" stroke-width="3" opacity=".28"/><circle cx="${circleX}" cy="${circleY}" r="172" fill="none" stroke="${palette.light}" stroke-width="1.8" opacity=".4"/>`
    : index%3===1
      ? `<path d="M ${circleX-185} 710 L ${circleX-185} 175 L ${circleX+165} 175 L ${circleX+165} 710" fill="none" stroke="${palette.veil}" stroke-width="4" opacity=".4"/>`
      : `<path d="M ${circleX-275} 580 Q ${circleX} -85 ${circleX+275} 580" fill="none" stroke="${palette.veil}" stroke-width="4" opacity=".4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 960" width="1600" height="960" role="img">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${palette.dark}"/><stop offset=".58" stop-color="${palette.mid}"/>
      <stop offset="1" stop-color="${palette.dark}"/></linearGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
       <stop stop-color="${palette.light}" stop-opacity=".0"/>
       <stop offset="1" stop-color="${palette.gold}" stop-opacity=".21"/></linearGradient>
    </defs>
    <rect width="1600" height="960" fill="url(#g)"/>
    <circle cx="${circleX}" cy="${circleY}" r="${250+(index%4)*24}" fill="${palette.gold}" opacity=".12"/>
    ${panels}${emblem}${ridges}
    <path d="M0 ${horizon+200} C400 ${horizon-45} 870 ${horizon+195} 1600 ${horizon-60} L1600 960 L0 960Z" fill="url(#b)"/>
    <path d="M0 850 L${frame} 110" stroke="${palette.gold}" stroke-width="3" opacity=".33"/>
    <rect x="40" y="40" width="1520" height="880" fill="none" stroke="${palette.light}" stroke-width="2" opacity=".13"/>
   </svg>`;
}

export function canFallbackFamilyForPalette(palette?:string):CanFallbackFamily {
  return palette==="forest"?"natural":palette==="harbor" || palette==="coastal" ||
    palette==="copper"?"harbor":"heritage";
}

export function canFallbackArtwork(
  family:CanFallbackFamily,slot:CanFallbackSlot,
):CanFallbackArtwork {
  const svg=illustrationSvg(family,slot);
  return {id:`can-original-${family}-${slot}-v1`,family,slot,
    src:"data:image/svg+xml,"+encodeURIComponent(svg),
    alt:"Decorative abstract illustration; not a photograph of this school",
    attribution:"CAN original abstract illustration"};
}

/** The finite 24-asset index is globally reusable, never a school-owned photo. */
export const canSchoolFallbackCollection=canFallbackFamilies.flatMap(family=>
  canFallbackSlots.map(slot=>({id:`can-original-${family}-${slot}-v1`,
    family,slot,attribution:"CAN original abstract illustration" as const})));
