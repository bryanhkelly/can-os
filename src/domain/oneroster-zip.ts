/** Small, deterministic, ZIP32/STORED archive for OneRoster CSV bulk exchange.
 * Binary data does not persist outside the authorized request. */
function crc32(bytes:Uint8Array):number{
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;}
 return (crc^0xffffffff)>>>0;
}
export function zipRosterFiles(files:Record<string,string>):Uint8Array{
 const entries=Object.entries(files).sort(([a],[b])=>a.localeCompare(b));
 if(entries.length===0||entries.length>30)throw new Error("OneRoster CSV archive file count unsupported.");
 const localParts:Buffer[]=[];
 const centralParts:Buffer[]=[];
 let offset=0;
 for(const [name,csv] of entries){
  if(!/^[A-Za-z]+\.csv$/.test(name))throw new Error("Invalid OneRoster CSV filename.");
  const filename=Buffer.from(name,"utf8");
  const data=Buffer.from(csv,"utf8");
  if(data.length>4*1024*1024)throw new Error("OneRoster CSV file is too large.");
  const checksum=crc32(data);
  const local=Buffer.alloc(30+filename.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);
  local.writeUInt16LE(0x800,6); // UTF-8 flag
  local.writeUInt16LE(0,8); // STORED, no decompression work for vendor
  local.writeUInt32LE(checksum,14);
  local.writeUInt32LE(data.length,18);
  local.writeUInt32LE(data.length,22);
  local.writeUInt16LE(filename.length,26);
  filename.copy(local,30);
  const central=Buffer.alloc(46+filename.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(0x800,8);
  central.writeUInt32LE(checksum,16);
  central.writeUInt32LE(data.length,20);
  central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(filename.length,28);
  central.writeUInt32LE(offset,42);
  filename.copy(central,46);
  offset+=local.length+data.length;
  localParts.push(local,data);centralParts.push(central);
 }
 const size=centralParts.reduce((sum,buffer)=>sum+buffer.length,0);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
 const result=Buffer.concat([...localParts,...centralParts,end]);
 if(result.length>12*1024*1024)throw new Error("OneRoster ZIP exceeds the synchronous export limit.");
 return result;
}
