import type {FastifyInstance} from 'fastify';

/** Keep the original Fastify JSON policy for normal REST operations. Signed
 * provider events are the sole JSON route that receives original bytes.
 * Do not parse, stringify or normalize a signed payload before verification. */
export function registerPublicProtocolParsers(server:FastifyInstance){
 const parseJson=server.getDefaultJsonParser('error','error');
 server.removeContentTypeParser('application/json');
 server.addContentTypeParser('application/json',{parseAs:'buffer'},(request,body,done)=>{
  if(request.routeOptions.url==='/api/v1/webhooks/resend'){
   if(body.length>64*1024){const error=Object.assign(new Error('Payload too large'),{statusCode:413});return done(error);}
   return done(null,body);
  }
  return parseJson(request,body.toString('utf8'),done);
 });
 server.addContentTypeParser(['application/x-www-form-urlencoded','multipart/form-data'],{parseAs:'buffer',bodyLimit:4096},(request,body,done)=>{
  if(request.routeOptions.url!=='/api/v1/campaigns/unsubscribe'){
   return done(Object.assign(new Error('Unsupported media type'),{statusCode:415}));
  }
  return done(null,body);
 });
}
