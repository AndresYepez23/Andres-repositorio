import {observeQueenProvider} from '../../_lib/queen-observations.js';
import {checkLimits} from "../../_lib/limits.js";
import {getProviderHold,setProviderHold} from "../../_lib/provider-health.js";
import {getCredentialSlots,requestWithCredentialPool} from "../../_lib/credential-pool.js";

// Only two shared syntheses per day, with a bounded amount of text per call.
// All API secrets stay on Cloudflare and the account budget remains unchanged.
const MODELS=new Set(["openai/tts-1","openai/tts-1-hd"]);
const VOICES=new Set(["nova","alloy","echo","shimmer","onyx","fable"]);
const FORMATS=new Set(["mp3","wav","opus"]);
const MAX_TEXT=1500;
const MAX_BODY=9000;
const MAX_AUDIO=12*1024*1024;
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const error=(message,status=400)=>Response.json({error:message},{status,headers:HEADERS});
export async function onRequestPost({request,env}){
 const queenObservedStart=Date.now();
 const origin=request.headers.get("Origin");
 if(origin!==new URL(request.url).origin)return error("Origen no autorizado.",403);
 if(Number(request.headers.get("Content-Length")||0)>MAX_BODY)return error("Solicitud demasiado grande.",413);
 let payload;
 try{const raw=await request.text();if(raw.length>MAX_BODY)return error("Solicitud demasiado grande.",413);payload=JSON.parse(raw);}
 catch{return error("La solicitud no contiene un JSON válido.",400);}
 const input=String(payload?.input||"").trim();
 if(input.length<2||input.length>MAX_TEXT)return error("El texto debe tener entre 2 y "+MAX_TEXT+" caracteres.",400);
 const model=String(payload?.model||"openai/tts-1");
 const voice=String(payload?.voice||"nova");
 const format=String(payload?.format||"mp3");
 if(!MODELS.has(model)||!VOICES.has(voice)||!FORMATS.has(format))return error("Modelo, voz o formato no autorizado.",400);
 if(!getCredentialSlots(env,"pollinations").length)return error("No hay una conexión central de voz activa. Puedes conectar tu cuenta de Pollinations en Laboratorio IA.",503);
 const hold=await getProviderHold(env,"pollinations-audio");
 if(hold)return error(hold.reason,hold.state==="quota_exhausted"?402:503);
 const limit=await checkLimits(env,request,"pollinations-audio");
 if(limit)return Response.json({error:limit.error,code:limit.code,retryAfter:limit.retryAfter},{status:limit.status,headers:HEADERS});
 let res;
 try{
  res=await requestWithCredentialPool(env,"pollinations",credential=>fetch("https://gen.pollinations.ai/v1/audio/speech",{
   method:"POST",
   headers:{"Authorization":"Bearer "+credential,"Content-Type":"application/json","Accept":"audio/*"},
   body:JSON.stringify({model,input,voice,response_format:format}),
   signal:AbortSignal.timeout(45000)
  }),{sweepQuotaSlots:true,sweepAuthSlots:true,sweepRateLimitSlots:true});
 }catch{return error("El motor de voz no respondió. Comprueba tu conexión o utiliza otro motor disponible.",502);}
 if(!res.ok){
  if(res.status===402&&getCredentialSlots(env,"pollinations").length<=1)await setProviderHold(env,"pollinations-audio","quota_exhausted","Pollinations no tiene saldo autorizado para generar voz.",3600);
  if([401,403].includes(res.status)&&getCredentialSlots(env,"pollinations").length<=1)await setProviderHold(env,"pollinations-audio","auth_error","La clave central no dispone de permiso de audio.",3600);
  if(res.status===429&&getCredentialSlots(env,"pollinations").length<=1)await setProviderHold(env,"pollinations-audio","rate_limited","El motor de voz alcanzó su límite temporal.",60);
  const message=res.status===402?"No hay saldo de Pollinations autorizado para esta voz. No se harán recargas automáticas.":
   [401,403].includes(res.status)?"La clave central no tiene permiso para generar audio.":
   res.status===429?"El motor de voz alcanzó su límite temporal.":"El proveedor de voz respondió con un error ("+res.status+").";
  return error(message,[400,402,429].includes(res.status)?res.status:502);
 }
 const type=(res.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
 if(!type.startsWith("audio/"))return error("El proveedor no devolvió audio válido.",502);
 const declared=Number(res.headers.get("content-length")||0);
 if(declared>MAX_AUDIO)return error("El audio generado supera el tamaño permitido.",502);
 const raw=await res.arrayBuffer();
 if(!raw.byteLength||raw.byteLength>MAX_AUDIO)return error("No se pudo recibir un audio válido o su tamaño es excesivo.",502);
 await observeQueenProvider(env,{provider:'pollinations',model,capability:'speech',status:200,durationMs:Date.now()-queenObservedStart});
 return new Response(raw,{headers:{...HEADERS,"Content-Type":type,"Content-Disposition":"attachment; filename=\"prisma-voz."+format+"\"","X-Prisma-Voice-Model":model}});
}
