import { getProviderHold, setProviderHold } from "../../_lib/provider-health.js";
import { allowedModel } from "../../_lib/model-catalog.js";
import { checkLimits } from "../../_lib/limits.js";
import { getCredentialSlots, requestWithCredentialPool } from "../../_lib/credential-pool.js";

function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}

export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(request.headers.get("Origin")!==url.origin)return json({error:"Origen no autorizado."},403);
 const maxBytes=12*1024*1024;
 if(Number(request.headers.get("Content-Length")||0)>maxBytes)return json({error:"El archivo supera 12 MB."},413);
 let form;
 try{form=await request.formData()}catch{return json({error:"Debes enviar un audio válido."},400);}
 const provider=String(form.get("provider")||"groq");
 const model=String(form.get("model")||(provider==="groq"?"whisper-large-v3-turbo":"openai/whisper-large-v3"));
 if(!["groq","huggingface"].includes(provider)||!allowedModel(provider,"audio",model))return json({error:"Modelo de transcripción no autorizado."},400);
 const file=form.get("file");
 if(!file||typeof file.arrayBuffer!=="function")return json({error:"Adjunta un archivo de audio."},400);
 if(file.size<=0||file.size>10*1024*1024)return json({error:"Audio vacío o superior a 10 MB."},413);
 if(provider==="groq"&&!getCredentialSlots(env,"groq").length)return json({error:"Groq todavía no está conectado."},503);
 if(provider==="groq"){
  const hold=await getProviderHold(env,"groq-audio");
  if(hold)return json({error:hold.reason,provider:"groq",status:429},429);
 }
 if(provider==="huggingface"&&(env.HF_MEDIA_ENABLED!=="1"||!getCredentialSlots(env,"huggingface").length))return json({error:"La transcripción de Hugging Face está desactivada para proteger los créditos gratuitos."},503);
 const limit=await checkLimits(env,request,provider==="groq"?"groq-audio":"huggingface-image");
 if(limit)return json({error:limit.error,code:limit.code,retryAfter:limit.retryAfter},limit.status);
 let response;
 try{
  if(provider==="groq"){
   const outbound=new FormData();
   outbound.append("file",file,typeof file.name==="string"?file.name:"audio.wav");
   outbound.append("model",model);
   outbound.append("response_format","json");
   const language=String(form.get("language")||"");
   if(language&&language!=="auto")outbound.append("language",language);
   response=await requestWithCredentialPool(env,"groq",credential=>fetch("https://api.groq.com/openai/v1/audio/transcriptions",{
    method:"POST",headers:{Authorization:"Bearer "+credential},body:outbound
   }));
  }else{
   response=await requestWithCredentialPool(env,"huggingface",async credential=>fetch("https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3",{
    method:"POST",headers:{Authorization:"Bearer "+credential,"Content-Type":file.type||"audio/wav"},body:await file.arrayBuffer()
   }));
  }
 }catch{
  if(provider==="groq")if(getCredentialSlots(env,"groq").length<=1)await setProviderHold(env,"groq-audio","network_error","Groq Whisper no respondió; Prisma lo pausó brevemente.",60);
  return json({error:"No fue posible conectar con el motor de transcripción."},502);
 }
 const result=await response.json().catch(()=>({}));
 if(!response.ok){
  if(provider==="groq"){
   const status=response.status;
   const holdSeconds=status===429?Math.max(30,Math.min(300,Number(response.headers.get("retry-after")||90))):status===401||status===403?3600:[500,502,503,504].includes(status)?60:0;
   if(holdSeconds&&getCredentialSlots(env,"groq").length<=1)await setProviderHold(env,"groq-audio",status===429?"rate_limited":status===401||status===403?"auth_error":"provider_unavailable",status===429?"Groq Whisper alcanzó un límite temporal. Prisma cambiará de motor.":status===401||status===403?"Groq rechazó la clave configurada.":"Groq Whisper está temporalmente indisponible.",holdSeconds);
  }
  return json({error:response.status===402?"Se agotaron los créditos gratuitos de Hugging Face.":"El proveedor de transcripción respondió con un error ("+response.status+").",provider,status:response.status},response.status===429?429:response.status===400?400:502);
 }
 const text=String(result.text||"").trim();
 if(!text)return json({error:"El proveedor no devolvió una transcripción."},502);
 return json({ok:true,provider,model,text});
}
