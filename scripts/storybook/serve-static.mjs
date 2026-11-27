import {createStorybookStaticServer} from "./static-server.mjs";
import {fileURLToPath} from "node:url";
const port=6007;
const server=await createStorybookStaticServer(fileURLToPath(new URL("../../storybook-static",import.meta.url)));
server.listen(port,"127.0.0.1",()=>console.log("Storybook fixture server: http://127.0.0.1:"+port));
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>server.close(()=>process.exit(0)));
