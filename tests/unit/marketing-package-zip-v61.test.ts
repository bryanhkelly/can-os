import { describe, expect, it } from "vitest";
import { buildMarketingPackageZip } from "@/components/launch-studio/marketing-output-download";

/** Validate independent ZIP signatures and CRC, not by reusing the writer. */
const readU16=(bytes:Uint8Array,pos:number)=>new DataView(
  bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(pos,true);
const readU32=(bytes:Uint8Array,pos:number)=>new DataView(
  bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(pos,true);
const decode=(bytes:Uint8Array,start:number,end:number)=>
  new TextDecoder().decode(bytes.subarray(start,end));

describe("immutable Marketing Package ZIP original bytes",()=>{
  it("writes a valid two-entry STORE archive with UTF-8 names, exact data and standard CRC",()=>{
    const zip=buildMarketingPackageZip([
      {name:"readme.txt",body:"123456789"},
      {name:"café.svg",body:"<svg>Ready ✓</svg>"},
    ]);
    expect(readU32(zip,0)).toBe(0x04034b50);
    expect(readU16(zip,8)).toBe(0); // STORE, never a client-side rerender
    expect(readU32(zip,14)).toBe(0xcbf43926); // Known CRC32 for 123456789
    const firstNameLen=readU16(zip,26);
    const firstBodyLen=readU32(zip,18);
    const firstBodyStart=30+firstNameLen;
    expect(decode(zip,30,firstBodyStart)).toBe("readme.txt");
    expect(decode(zip,firstBodyStart,firstBodyStart+firstBodyLen)).toBe("123456789");

    const next=firstBodyStart+firstBodyLen;
    expect(readU32(zip,next)).toBe(0x04034b50);
    expect(readU16(zip,next+6)&0x0800).toBe(0x0800); // UTF-8 filename flag
    const secondNameLen=readU16(zip,next+26);
    const secondBodyLen=readU32(zip,next+18);
    const bodyStart=next+30+secondNameLen;
    expect(decode(zip,next+30,bodyStart)).toBe("café.svg");
    expect(decode(zip,bodyStart,bodyStart+secondBodyLen)).toBe("<svg>Ready ✓</svg>");
    expect(secondBodyLen).toBe(new TextEncoder().encode("<svg>Ready ✓</svg>").length);

    const end=zip.length-22;
    expect(readU32(zip,end)).toBe(0x06054b50);
    expect(readU16(zip,end+10)).toBe(2);
    const directoryOffset=readU32(zip,end+16);
    const directorySize=readU32(zip,end+12);
    expect(directoryOffset+directorySize).toBe(end);
    expect(readU32(zip,directoryOffset)).toBe(0x02014b50);
    const firstCentralNameLen=readU16(zip,directoryOffset+28);
    const secondCentral=directoryOffset+46+firstCentralNameLen;
    expect(readU32(zip,secondCentral)).toBe(0x02014b50);
    expect(readU32(zip,secondCentral+42)).toBe(next);
  });

  it("rejects empty, duplicate, traversing or unsafe filenames before downloads",()=>{
    expect(()=>buildMarketingPackageZip([])).toThrow();
    for(const name of ["","../private.txt","dir/file.txt","dir\\file.txt",".",".."]){
      expect(()=>buildMarketingPackageZip([{name,body:"x"}])).toThrow();
    }
    expect(()=>buildMarketingPackageZip([
      {name:"flyer.svg",body:"old"},{name:"flyer.svg",body:"new"},
    ])).toThrow();
    expect(()=>buildMarketingPackageZip(Array.from({length:21},(_,i)=>({
      name:`file-${i}.txt`,body:"x",
    })))).toThrow();
  });

  it("returns exactly the same archive bytes for the same frozen outputs",()=>{
    const files=[
      {name:"email.html",body:"<h1>Welcome</h1>"},
      {name:"social-caption.txt",body:"Full original announcement."},
      {name:"package-manifest.json",body:'{"releaseNumber":2}'},
    ];
    expect([...buildMarketingPackageZip(files)]).toEqual([...buildMarketingPackageZip(files)]);
    expect([...buildMarketingPackageZip([...files].reverse())])
      .not.toEqual([...buildMarketingPackageZip(files)]);
  });
});
