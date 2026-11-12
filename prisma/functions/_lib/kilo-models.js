import { getCredentialSlots, requestWithCredentialPool } from "./credential-pool.js";

let cachedModels = [];
let cacheExpiresAt = 0;

// The public Kilo catalogue includes live prices. Only zero-input/zero-output
// chat models are exposed; paid models can never enter Prisma's allowlist.
export async function getKiloFreeModels(env, { force = false } = {}) {
  if (!force && cachedModels.length && Date.now() < cacheExpiresAt) return cachedModels;
  try {
    const slots = getCredentialSlots(env, "kilo");
    const send = key => fetch("https://ai-gateway.kilo.ai/api/v1/models", {
      headers: key ? { Authorization: "Bearer " + key } : {},
    });
    const response = slots.length
      ? await requestWithCredentialPool(env, "kilo", key => send(key), { countRequest: false, sweepAuthSlots: true, retryStatuses: [401,403] })
      : await send("");
    if (!response.ok) {
      cacheExpiresAt = Date.now() + 30_000;
      return [];
    }
    const payload = await response.json().catch(() => ({}));
    const models = Array.isArray(payload.data) ? payload.data : [];
    cachedModels = models
      .filter(model => {
        const id = String(model?.id || "");
        const prompt = Number(model?.pricing?.prompt);
        const completion = Number(model?.pricing?.completion);
        const outputs = model?.architecture?.output_modalities;
        const textOutput = !Array.isArray(outputs) || outputs.includes("text");
        const chatLike = !/(lyria|music|image|video|audio|speech|embedding|transcrib|ocr|moderation|content.safety|guardrail|rerank)/i.test(id + " " + String(model?.name || ""));
        const mediaOutput = Array.isArray(outputs) && outputs.some(type => ["audio","video","image"].includes(String(type).toLowerCase()));
        return id && prompt === 0 && completion === 0 && textOutput && chatLike && !mediaOutput;
      })
      .map(model => {
        const id = String(model.id);
        const nvidia = id.toLowerCase().startsWith("nvidia/");
        return {
          id,
          name: String(model.name || model.id),
          specialty: nvidia
            ? "Gratis · endpoint NVIDIA de prueba; puede registrar prompts. No enviar datos personales o confidenciales."
            : "Modelo de chat gratuito · precio cero verificado en el catálogo Kilo",
        };
      });
    cacheExpiresAt = Date.now() + 60_000;
    return cachedModels;
  } catch (error) {
    console.warn("Kilo free model catalogue unavailable", error?.message || error);
    cacheExpiresAt = Date.now() + 30_000;
    return [];
  }
}

let cachedCreativeModels = [];
let creativeCacheExpiresAt = 0;

// Discovery only: never passes these models to the text-chat allowlist or
// invokes paid/media endpoints. Pricing must explicitly be zero on both sides.
export async function getKiloCreativeModels(env,{force=false}={}){
 if(!force&&Date.now()<creativeCacheExpiresAt)return cachedCreativeModels;
 try{
  const slots=getCredentialSlots(env,"kilo");
  const send=key=>fetch("https://ai-gateway.kilo.ai/api/v1/models",{
   headers:key?{Authorization:"Bearer "+key}:{}
  });
  const response=slots.length
   ?await requestWithCredentialPool(env,"kilo",key=>send(key),{countRequest:false,sweepAuthSlots:true,retryStatuses:[401,403]})
   :await send("");
  if(!response.ok)throw Error("Catalog HTTP "+response.status);
  const payload=await response.json();
  cachedCreativeModels=(Array.isArray(payload?.data)?payload.data:[])
   .filter(model=>{
    const id=String(model?.id||"");
    const name=String(model?.name||"");
    const outputs=model?.architecture?.output_modalities;
    const special=/(lyria|music|image|video|audio|speech|transcrib|whisper|tts|embedding|rerank|moderation|guardrail|flux|diffusion)/i.test(id+" "+name)
     ||Array.isArray(outputs)&&outputs.some(x=>["audio","video","image","embedding"].includes(String(x).toLowerCase()));
    return id&&special&&model?.pricing?.prompt!=null&&model?.pricing?.completion!=null&&
     Number(model.pricing.prompt)===0&&Number(model.pricing.completion)===0;
   })
   .map(model=>({id:String(model.id),name:String(model.name||model.id),
    specialty:"Modelo especializado · precio de entrada y salida cero en el catálogo Kilo · ejecución pendiente"}));
  creativeCacheExpiresAt=Date.now()+5*60_000;
  return cachedCreativeModels;
 }catch(error){
  console.warn("Kilo creative catalogue unavailable",error?.message||error);
  creativeCacheExpiresAt=Date.now()+30_000;cachedCreativeModels=[];return [];
 }
}
