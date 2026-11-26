/** Keep interactive viewport names and the independently exercised widths aligned. */
export const viewports = {
  compact: {name:"Compact phone · 320",styles:{width:"320px",height:"720px"},type:"mobile"},
  phone: {name:"Phone · 390",styles:{width:"390px",height:"844px"},type:"mobile"},
  tablet: {name:"Tablet · 768",styles:{width:"768px",height:"1024px"},type:"tablet"},
  laptop: {name:"Laptop · 1024",styles:{width:"1024px",height:"768px"},type:"desktop"},
  desktop: {name:"Desktop · 1440",styles:{width:"1440px",height:"900px"},type:"desktop"},
  wide: {name:"Wide desktop · 1920",styles:{width:"1920px",height:"1080px"},type:"desktop"},
} as const;

// Preserve the legacy automatic mode names while using the current Modes API.
// The independent browser matrix additionally exercises 320px and theme combinations.
export const baselineWidths = [390,768,1024,1440];
export const storybookThemes = ["light","dark","site"] as const;

/** Widths are named exactly as legacy Chromatic viewport-derived modes. */
export function chromaticWidthModes(widths:readonly number[]){
  return Object.fromEntries(widths.map(width=>[width+"px",{viewport:width}]));
}
export const baselineModes=chromaticWidthModes(baselineWidths);
