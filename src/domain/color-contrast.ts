/** One WCAG relative-luminance/contrast calculation for public Site identity and UI. */
export function contrastRatio(foreground:string,background:string):number{
  const luminance=(hex:string)=>{
    if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error("Expected a six-digit hex color");
    const [r,g,b]=[1,3,5].map(i=>{
      const c=Number.parseInt(hex.slice(i,i+2),16)/255;
      return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
    });
    return r!*0.2126+g!*0.7152+b!*0.0722;
  };
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
