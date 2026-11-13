import {observeQueenProvider} from '../../_lib/queen-observations.js';
import { allowedModel } from "../../_lib/model-catalog.js";
import { checkLimits } from "../../_lib/limits.js";
import { getCredentialSlots, requestWithCredentialPool } from "../../_lib/credential-pool.js";

function errorResponse(error,status=400){
 return Response.json({error},{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
export async function onRequestPost({request,env}){
 const queenObservedStart=Date.now();
 const url=new URL(request.url);
 if(request.headers.get("Origin")!==url.origin)return errorResponse("Origen no autorizado.",403);
 if(Number(request.headers.get("Content-Length")||0)>8192)return errorResponse("La solicitud es demasiado grande.",413);
 let payload;
 try{
  const input=await request.text();
  if(input.length>8192)return errorResponse("La solicitud es demasiado grande.",413);
  payload=JSON.parse(input);
 }catch{return errorResponse("Solicitud inválida.",400);}
 const prompt=String(payload.prompt||"").trim();
 const provider=String(payload.provider||"cloudflare");
 if(prompt.length<8||prompt.length>1800)return errorResponse("Describe la imagen en 8 a 1800 caracteres.",400);
 if(!["cloudflare","huggingface","pollinations","gemini"].includes(provider))return errorResponse("Motor de imagen no permitido.",400);
 const model=String(payload.model|| (provider==="cloudflare"?"@cf/black-forest-labs/flux-1-schnell":provider==="pollinations"?"black-forest-labs/flux.1-schnell":provider==="gemini"?"gemini-3.1-flash-image":"stabilityai/stable-diffusion-3-medium-diffusers"));
 if(!allowedModel(provider,"image",model))return errorResponse("Modelo de imagen no disponible en Prisma.",400);
 if(provider==="pollinations"&&!getCredentialSlots(env,"pollinations").length)return errorResponse("Pollinations compartido aún no está habilitado. Configura POLLINATIONS_API_KEYS_JSON o POLLINATIONS_API_KEY como secreto de Cloudflare.",503);
 if(provider==="cloudflare"&&!env.AI?.run)return errorResponse("Workers AI no está conectado en Cloudflare.",503);
 if(provider==="huggingface"&&(env.HF_MEDIA_ENABLED!=="1"||!getCredentialSlots(env,"huggingface").length))
  return errorResponse("Las imágenes de Hugging Face requieren activar explícitamente HF_MEDIA_ENABLED=1; no consumiremos tus créditos sin autorización.",503);
  if(provider==="gemini"&&(env.GEMINI_IMAGE_ENABLED!=="1"||!getCredentialSlots(env,"gemini").length))
   return errorResponse("Gemini Image es un motor de pago opcional. Requiere GEMINI_IMAGE_ENABLED=1 y una clave autorizada.",503);
 const quota=await checkLimits(env,request,provider+"-image");
 if(quota)return Response.json({error:quota.error,code:quota.code||'LIMIT',retryAfter:quota.retryAfter,scope:quota.scope},{status:quota.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(provider==="gemini"){
  try{
   const ratios={square:"1:1",landscape:"4:3",portrait:"3:4",wide:"16:9"};
   const response=await requestWithCredentialPool(env,"gemini",credential=>fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":credential},
    body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseModalities:["IMAGE"],responseFormat:{image:{aspectRatio:ratios[payload.ratio]||"1:1",imageSize:"1K"}}}})
   }));
   if(!response.ok)return errorResponse("Gemini no pudo generar la imagen ("+response.status+").",response.status===429?429:502);
   const result=await response.json();
   const part=result.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data||p.inline_data?.data);
   const data=part?.inlineData||part?.inline_data;
   if(!data?.data)return errorResponse("Gemini no devolvió datos de imagen.",502);
   const bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
   if(bytes.byteLength>10*1024*1024)return errorResponse("La imagen de Gemini excede 10 MB.",502);
   const mime=data.mimeType||data.mime_type||"image/png";
   if(!["image/png","image/jpeg","image/webp"].includes(mime))return errorResponse("Gemini devolvió un tipo de archivo no permitido.",502);
   await observeQueenProvider(env,{provider,model,capability:'image',status:200,durationMs:Date.now()-queenObservedStart});
   return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"no-store","X-Prisma-Model":model,"X-Content-Type-Options":"nosniff"}});
  }catch(error){console.error("Prisma Gemini Image",String(error?.message||error).slice(0,100));return errorResponse("No fue posible generar la imagen con Gemini.",502);}
 }
 if(provider==="cloudflare"){
  try{
   const response=await env.AI.run(model,{prompt:prompt.slice(0,1800),steps:4,...(Number.isInteger(Number(payload.seed))&&Number(payload.seed)>0?{seed:Number(payload.seed)}:{})});
   if(!response?.image)return errorResponse("Workers AI no devolvió ninguna imagen.",502);
   const raw=atob(response.image);
   const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
   await observeQueenProvider(env,{provider,model,capability:'image',status:200,durationMs:Date.now()-queenObservedStart});
   return new Response(bytes,{headers:{"Content-Type":"image/jpeg","Cache-Control":"no-store","X-Prisma-Model":model,"X-Content-Type-Options":"nosniff"}});
  }catch(error){
   console.error("Prisma image Workers AI",String(error?.message||error).slice(0,120));
   return errorResponse("No fue posible generar la imagen en Workers AI. Puede haberse agotado la cuota gratuita diaria.",502);
  }
 }
 if(provider==="pollinations"){
  try{
   const imageUrl=new URL("https://gen.pollinations.ai/image/"+encodeURIComponent(prompt));
   imageUrl.searchParams.set("model",model);
   const ratios={square:[768,768],landscape:[1024,768],portrait:[768,1024],wide:[1024,576]};
   const [width,height]=ratios[String(payload.ratio||"square")]||ratios.square;
   imageUrl.searchParams.set("width",String(width));
   imageUrl.searchParams.set("height",String(height));
   if(Number.isInteger(Number(payload.seed))&&Number(payload.seed)>0)imageUrl.searchParams.set("seed",String(Number(payload.seed)));
   const response=await requestWithCredentialPool(env,"pollinations",credential=>fetch(imageUrl,{headers:{Authorization:"Bearer "+credential,Accept:"image/png,image/jpeg,image/webp"}}));
   if(!response.ok)return errorResponse(response.status===402?"Pollinations no dispone de saldo autorizado para generar imágenes.":"Pollinations no pudo generar la imagen ("+response.status+").",response.status===402?402:response.status===429?429:502);
   const mime=(response.headers.get("content-type")||"").split(";")[0].trim();
   if(!["image/png","image/jpeg","image/webp"].includes(mime))return errorResponse("Pollinations no devolvió una imagen válida.",502);
   const length=Number(response.headers.get("content-length")||0);
   if(length>10*1024*1024)return errorResponse("La imagen generada supera 10 MB.",502);
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength>10*1024*1024)return errorResponse("La imagen generada supera 10 MB.",502);
   await observeQueenProvider(env,{provider,model,capability:'image',status:200,durationMs:Date.now()-queenObservedStart});
   return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){
   console.error("Prisma image Pollinations",String(error?.message||error).slice(0,100));
   return errorResponse("No fue posible generar la imagen con Pollinations.",502);
  }
 }
 // Explicitly gated Hugging Face media provider.
 try{
  const response=await requestWithCredentialPool(env,"huggingface",credential=>fetch("https://router.huggingface.co/hf-inference/models/"+model,{
   method:"POST",
   headers:{Authorization:"Bearer "+credential,"Content-Type":"application/json",Accept:"image/png,image/jpeg"},
   body:JSON.stringify({inputs:prompt,parameters:{num_inference_steps:16}})
  }));
  if(!response.ok)return errorResponse(response.status===402?"Se agotaron los créditos de Hugging Face.":"Hugging Face no pudo generar la imagen ("+response.status+").",response.status===402?402:502);
  const mime=response.headers.get("Content-Type")||"";
  if(!mime.startsWith("image/"))return errorResponse("Hugging Face no devolvió una imagen válida.",502);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>10*1024*1024)return errorResponse("La imagen excede el tamaño permitido.",502);
  await observeQueenProvider(env,{provider,model,capability:'image',status:200,durationMs:Date.now()-queenObservedStart});
   return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return errorResponse("No fue posible conectar con Hugging Face para crear la imagen.",502);}
}
