import { useState } from "react";
import { Download, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildUrlDestination, absoluteDestinationUrl } from "@/domain/url-destinations";
import { getCanonicalGoLinkShareOrigin } from "@/modules/engagement/go-link-share-origin.functions";
import { goCodeSchema } from "@/domain/site-go-links";

/** QR uses the exact server-approved public Go Link, never a staging hostname.
 * The PNG is produced locally only when requested. No external QR API,
 * tracking pixel, identity cookie or participant metadata is involved.
 */
export function GoLinkQrButton({code,disabled=false}:{code:string;disabled?:boolean}){
  const [image,setImage]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [open,setOpen]=useState(false);
  async function show(){
    if(busy||disabled)return;
    setOpen(true);
    if(image)return;
    setBusy(true);setError("");
    try{
      goCodeSchema.parse(code);
      const origin=await getCanonicalGoLinkShareOrigin();
      const url=absoluteDestinationUrl(buildUrlDestination({kind:"go",code}),origin);
      const {default:QRCode}=await import("qrcode");
      const data=await QRCode.toDataURL(url,{
        width:480,margin:3,errorCorrectionLevel:"Q",
      });
      setImage(data);
    }catch{
      setError("QR code cannot be created until the public application address is verified.");
    }finally{setBusy(false);}
  }
  return <div>
    <Button type="button" size="sm" variant="outline"
      disabled={disabled||busy} onClick={()=>void show()}><QrCode aria-hidden="true"/> QR code</Button>
    {open&&<div className="mt-2 max-w-xs border bg-card p-3" role="group"
      aria-label="Go Link QR code">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Public Go Link</p>
        <Button type="button" size="icon" variant="ghost"
          onClick={()=>setOpen(false)} aria-label="Close QR preview">
          <X aria-hidden="true"/>
        </Button>
      </div>
      {busy&&<p role="status" className="mt-2 text-sm">Generating a printable QR code…</p>}
      {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {image&&<>
        <img alt="QR code linking to this published Go Link" src={image}
          width={240} height={240} className="mx-auto mt-2 h-auto max-w-full"/>
        <Button asChild type="button" size="sm" variant="outline" className="mt-2">
          <a href={image} download={`go-link-${code}.png`}>
            <Download aria-hidden="true"/> Download PNG
          </a>
        </Button>
      </>}
      <p className="mt-2 text-xs text-muted-foreground">
        Printed codes use the approved public address. Destination eligibility
        is checked every time a person opens the link.
      </p>
    </div>}
  </div>;
}
