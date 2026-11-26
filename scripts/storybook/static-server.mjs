import {createServer} from "node:http";
import {createReadStream} from "node:fs";
import {stat,realpath} from "node:fs/promises";
import {resolve,relative,isAbsolute,extname,sep} from "node:path";

const types={
 ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",
 ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif",
 ".ico":"image/x-icon",".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf",
 ".txt":"text/plain; charset=utf-8",".mp4":"video/mp4",".webm":"video/webm",".pdf":"application/pdf"
};
function within(root,file){
 const rel=relative(root,file);
 return rel!==""&&!isAbsolute(rel)&&rel!==".."&&!rel.startsWith(".."+sep);
}
/** Static-only, loopback fixture server. No SPA fallback, RPC or application environment. */
export async function createStorybookStaticServer(directory){
 const root=await realpath(directory);
 const index=await stat(resolve(root,"index.json"));
 if(!index.isFile())throw Error("Build Storybook before serving it.");
 return createServer(async(req,res)=>{
   res.setHeader("Cache-Control","no-store");
   res.setHeader("X-Content-Type-Options","nosniff");
   function reply(code,message){res.writeHead(code,{"Content-Type":"text/plain; charset=utf-8"});res.end(message);}
   if(!["GET","HEAD"].includes(req.method??"")){res.setHeader("Allow","GET, HEAD");return reply(405,"Method not allowed");}
   try{
    // Reject traversal before URL normalization, encoded separators and dot segments.
    const raw=(req.url??"/").split("?")[0];
    const path=decodeURIComponent(raw);
    if(!path.startsWith("/")||path.includes("\\")||path.includes("\0")||path.split("/").some(segment=>segment.startsWith(".")))return reply(400,"Invalid path");
    if(/^\/(?:api|_server|_serverFn|rpc|go)(?:\/|$)/i.test(path))return reply(404,"Not found");
    const target=resolve(root,"."+ (path==="/"?"/index.html":path));
    if(!within(root,target))return reply(404,"Not found");
    const file=await realpath(target);
    if(!within(root,file))return reply(404,"Not found");
    const info=await stat(file);
    if(!info.isFile())return reply(404,"Not found");
    const contentType=types[extname(file).toLowerCase()]??"application/octet-stream";
    res.writeHead(200,{"Content-Type":contentType,"Content-Length":info.size});
    if(req.method==="HEAD")return res.end();
    const stream=createReadStream(file);
    stream.on("error",()=>res.destroy());res.on("close",()=>stream.destroy());stream.pipe(res);
   }catch(error){
    if(res.headersSent)return res.destroy();
    return reply(error instanceof URIError?400:404,"Not found");
   }
 });
}
