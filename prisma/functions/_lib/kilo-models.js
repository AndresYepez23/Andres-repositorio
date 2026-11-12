import { getCredentialSlots, requestWithCredentialPool } from "./credential-pool.js";
import { creativeKind } from "./creative-models.js";

let cachedModels = [];
let cachedCreativeModels = [];
let cacheExpiresAt = 0;

// The public Kilo catalogue includes live prices. Only zero-input/zero-output
// chat models are exposed; paid models can never enter Prisma's allowlist.
export async function getKiloFreeModels(env, { force = false } = {}) {
  if (!force && Date.now() < cacheExpiresAt) return cachedModels;
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
    // Catalog all zero-cost results, not only text models. Preserve media and
    // moderation options for a capability-specific UI without sending them to
    // the chat-completion endpoint.
    const zeroCost=models.filter(model=>{
      const id=String(model?.id||"");
      const prompt=Number(model?.pricing?.prompt);
      const completion=Number(model?.pricing?.completion);
      return Boolean(id)&&model?.pricing?.prompt!=null&&model?.pricing?.completion!=null&&
        prompt===0&&completion===0;
    }).map(model=>{
      const id=String(model.id),nvidia=id.toLowerCase().startsWith("nvidia/");
      return {id,name:String(model.name||model.id),
        kind:creativeKind(model)||"chat",
        specialty:nvidia
         ?"Gratis · endpoint NVIDIA experimental; no enviar datos privados"
         :"Modelo gratuito · precio cero verificado en el catálogo Kilo"};
    });
    cachedCreativeModels=zeroCost.filter(model=>model.kind!=="chat");
    cachedModels=zeroCost.filter(model=>model.kind==="chat").map(({kind,...rest})=>rest);
    cacheExpiresAt = Date.now() + 60_000;
    return cachedModels;
  } catch (error) {
    console.warn("Kilo free model catalogue unavailable", error?.message || error);
    cacheExpiresAt = Date.now() + 30_000;
    return [];
  }
}

// Exposed only to the capability-specific "Crear" tab; never used for chat routing.
export async function getKiloFreeCreativeModels(env,{force=false}={}){
 await getKiloFreeModels(env,{force});
 return cachedCreativeModels;
}
