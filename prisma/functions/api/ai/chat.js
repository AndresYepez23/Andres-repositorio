import { getProviderHold, setProviderHold } from "../../_lib/provider-health.js";
import { allowedModel } from "../../_lib/model-catalog.js";
import { checkLimits } from "../../_lib/limits.js";
import { getCredentialSlots, requestWithCredentialPool } from "../../_lib/credential-pool.js";
import { getAmdFreeModels } from "../../_lib/amd-models.js";
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 24) {
    throw new Error("La conversación debe incluir entre 1 y 24 mensajes.");
  }

  const system = [];
  const contents = [];
  let totalChars = 0;

  for (const item of input) {
    const role = String(item?.role || "");
    const content = String(item?.content || "");
    if (!["system", "user", "assistant", "model"].includes(role)) continue;
    if (!content.trim()) continue;

    totalChars += content.length;
    if (totalChars > 30000) throw new Error("El contexto supera el límite permitido de 30.000 caracteres.");

    if (role === "system") {
      system.push(content.slice(0, 12000));
      continue;
    }

    const mappedRole = role === "assistant" || role === "model" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === mappedRole) last.parts[0].text += "\n\n" + content;
    else contents.push({ role: mappedRole, parts: [{ text: content }] });
  }

  if (!contents.length || contents[0].role !== "user") {
    throw new Error("La solicitud debe comenzar con un mensaje del usuario.");
  }

  const openaiMessages = [
    ...system.map((content) => ({ role: "system", content })),
    ...contents.map((item) => ({
      role: item.role === "model" ? "assistant" : "user",
      content: item.parts.map((part) => part.text || "").join("\n"),
    })),
  ];

  return { system, contents, openaiMessages };
}

async function callOpenAICompatibleProvider(env, provider, endpoint, model, messages, payload, extraHeaders = {}) {
  if (!getCredentialSlots(env,provider).length) return json({error:"Falta configurar la clave de "+provider+" en los secretos de Cloudflare.",provider},503);
  let response;
  try {
    response = await requestWithCredentialPool(env, provider, credential => fetch(endpoint, {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+credential,...extraHeaders},
      body:JSON.stringify({model,messages,temperature:0.65,max_tokens:clamp(payload.maxOutputTokens,128,4096,1200),stream:false}),
    }));
  } catch (error) {
    const status=Number(error?.status)||502;
    return json({error:error?.message||"No fue posible conectar con "+provider+".",provider,status,retryAfter:error?.retryAfter||null},status===429?429:status===402?402:502);
  }
  const data=await response.json().catch(()=>({}));
  if (!response.ok) {
    const status=response.status;
    const detail=String(data.error?.message||data.error?.code||data.message||"").slice(0,180);
    const message=status===429?provider+" alcanzó su límite temporal. Prisma probará otro motor."
      :status===402?provider+" no tiene crédito gratuito disponible."
      :status===401||status===403?provider+" rechazó la clave configurada. Revisa su secreto en Cloudflare."
      :provider+" respondió con un error ("+status+")."+(detail?" "+detail:"");
    return json({error:message,provider,status,code:status===429||status===402?"PROVIDER_LIMIT":status===400?"INVALID_MODEL":"PROVIDER_ERROR"},status===429||status===402?status:status===400?400:502);
  }
  const content=data.choices?.[0]?.message?.content;
  const text=(typeof content==="string"?content:Array.isArray(content)?content.map(part=>part?.text||"").join("\\n"):"").trim();
  if(!text)return json({error:provider+" no devolvió texto.",provider},502);
  return json({ok:true,provider,model:data.model||model,text,usage:data.usage||null});
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin !== requestUrl.origin) {
    return json({ error: "Solicitud no autorizada para este origen." }, 403);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 50000) return json({ error: "La solicitud supera el tamaño permitido." }, 413);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 50000) return json({ error: "La solicitud supera el tamaño permitido." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "El cuerpo de la solicitud no es JSON válido." }, 400);
  }

  const provider = String(payload.provider || "gemini");
  if (!["gemini", "huggingface", "groq", "cloudflare", "pollinations", "openrouter", "kilo", "requesty", "sensenova", "zai", "baidu", "aihubmix", "amd"].includes(provider)) {
    return json({ error: "Este proveedor todavía no está habilitado en el backend central." }, 501);
  }

  if (provider === "openrouter" && !getCredentialSlots(env,"openrouter").length) {
    return json({ error: "OpenRouter no está configurado. Añade OPENROUTER_API_KEY como secreto de Cloudflare.", provider: "openrouter" }, 503);
  }

  let normalized;
  try {
    normalized = normalizeMessages(payload.messages);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const requestedModel = String(payload.model || "");
  const amdModels = provider === "amd" ? await getAmdFreeModels(env) : null;
  const requestedModelAllowed = provider === "amd"
    ? Boolean(requestedModel && amdModels.some(model => model.id === requestedModel))
    : !requestedModel || allowedModel(provider, "chat", requestedModel);
  if (requestedModel && !requestedModelAllowed) {
    return json({error:provider === "amd" ? "AMD no publica ese modelo como gratuito y compatible con texto en este momento." : "Modelo no permitido para el proveedor seleccionado."},400);
  }
  if(provider==="pollinations"&&getCredentialSlots(env,"pollinations").length<=1){
    const hold=await getProviderHold(env,"pollinations");
    if(hold)return json({error:hold.reason,provider:"pollinations",status:402},402);
  }
  if(provider==="huggingface"&&getCredentialSlots(env,"huggingface").length<=1){
    const hold=await getProviderHold(env,"huggingface");
    if(hold)return json({error:hold.reason,provider:"huggingface",status:402},402);
  }
  if(provider==="groq"&&getCredentialSlots(env,"groq").length<=1){
    const hold=await getProviderHold(env,"groq");
    if(hold)return json({error:hold.reason,provider:"groq",status:429,retryAfter:hold.valid_until?Math.max(1,Number(hold.valid_until)-Math.floor(Date.now()/1000)):90},429);
  }
  if(provider==="openrouter"&&getCredentialSlots(env,"openrouter").length<=1){
    const hold=await getProviderHold(env,"openrouter");
    if(hold)return json({error:hold.reason,provider:"openrouter",status:429,retryAfter:hold.valid_until?Math.max(1,Number(hold.valid_until)-Math.floor(Date.now()/1000)):90},429);
  }
  const limitError = await checkLimits(env, request, provider);
  if (limitError) return json({error:limitError.error,code:limitError.code,scope:limitError.scope,retryAfter:limitError.retryAfter},limitError.status);

  if (provider === "openrouter") {
    const model = requestedModel || "openrouter/free";
    let response;
    try {
      response = await requestWithCredentialPool(env,"openrouter", credential => fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + credential,
          "HTTP-Referer": "https://prismaspace.pages.dev",
          "X-Title": "Prisma Space",
        },
        body: JSON.stringify({
          model,
          messages: normalized.openaiMessages,
          temperature: 0.65,
          max_tokens: clamp(payload.maxOutputTokens, 128, 3000, 1200),
          stream: false,
          usage: { include: true },
        }),
      }));
    } catch {
      if(getCredentialSlots(env,"openrouter").length<=1)await setProviderHold(env, "openrouter", "network_error", "OpenRouter no respondió; Prisma lo pausó brevemente.", 60);
      return json({ error: "No fue posible conectar con OpenRouter.", provider: "openrouter", status: 502, retryAfter: 60 }, 502);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status;
      const providerMessage = String(data.error?.message || data.error || "").slice(0, 220);
      const dailyLimit = /daily|per.day|requests per day|free.model.*limit/i.test(providerMessage);
      let holdSeconds = 0;
      if (status === 429) holdSeconds = dailyLimit ? 21600 : Math.max(30, Math.min(300, Number(response.headers.get("retry-after") || 60)));
      else if (status === 402) holdSeconds = 21600;
      else if (status === 401 || status === 403) holdSeconds = 3600;
      else if ([500, 502, 503, 504].includes(status)) holdSeconds = 60;
      if (holdSeconds) {
        const state = status === 429 ? "rate_limited" : status === 402 ? "quota_exhausted" : status === 401 || status === 403 ? "auth_error" : "provider_unavailable";
        const reason = status === 429 ? "OpenRouter alcanzó un límite temporal; Prisma lo pausó y seguirá con los demás motores." :
          status === 402 ? "OpenRouter no tiene saldo o la cuenta no puede usar modelos gratuitos." :
          status === 401 || status === 403 ? "OpenRouter rechazó la clave. Revisa OPENROUTER_API_KEY en Cloudflare." :
          "OpenRouter está temporalmente indisponible.";
        if(getCredentialSlots(env,"openrouter").length<=1)await setProviderHold(env, "openrouter", state, reason, holdSeconds);
      }
      const message = status === 429 ? "OpenRouter alcanzó su límite temporal." :
        status === 402 ? "OpenRouter no tiene saldo disponible para esta solicitud." :
        status === 401 || status === 403 ? "OpenRouter rechazó la clave configurada. Revisa OPENROUTER_API_KEY." :
        "OpenRouter respondió con un error (" + status + ")." + (providerMessage ? " " + providerMessage : "");
      return json({ error: message, provider: "openrouter", status, code: status === 429 || status === 402 ? "PROVIDER_LIMIT" : status === 400 ? "INVALID_MODEL" : "PROVIDER_ERROR", retryAfter: holdSeconds || null }, status === 429 || status === 402 ? status : status === 400 ? 400 : 502);
    }

    const content = data.choices?.[0]?.message?.content;
    const text = (typeof content === "string" ? content : Array.isArray(content) ? content.map(part => part?.text || "").join("\n") : "").trim();
    if (!text) return json({ error: "OpenRouter no devolvió texto.", provider: "openrouter" }, 502);
    return json({ ok: true, provider: "openrouter", model: data.model || model, text, usage: data.usage || null });
  }

  if (provider === "pollinations") {
    if (!getCredentialSlots(env,"pollinations").length) return json({error:"Pollinations compartido aún no está activado. Configura POLLINATIONS_API_KEY como secreto de producción; Pollinations Connect personal sigue disponible.",provider:"pollinations"},503);
    const model=requestedModel||"openai/gpt-5.4-nano";
    let response;
    try {
      response=await requestWithCredentialPool(env,"pollinations", credential=>fetch("https://gen.pollinations.ai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+credential},
        body:JSON.stringify({model,messages:normalized.openaiMessages,temperature:0.7,max_tokens:clamp(payload.maxOutputTokens,128,2200,800),stream:false})
      }));
    } catch {
      return json({error:"No fue posible conectar con Pollinations. Prisma probará otro motor.",provider:"pollinations"},502);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===402&&getCredentialSlots(env,"pollinations").length<=1)await setProviderHold(env,"pollinations","quota_exhausted","Pollinations no dispone de saldo autorizado. Prisma usará los demás motores.",21600);
      if((response.status===401||response.status===403)&&getCredentialSlots(env,"pollinations").length<=1)await setProviderHold(env,"pollinations","auth_error","La clave central Pollinations no está autorizada. Revisa el secreto en Cloudflare.",3600);
      const message=response.status===429?"Pollinations alcanzó su límite temporal.":response.status===402?"Pollinations no dispone de saldo autorizado.":"Pollinations respondió con un error ("+response.status+").";
      return json({error:message,provider:"pollinations",status:response.status},response.status===429?429:response.status===402?402:502);
    }
    const text=String(data.choices?.[0]?.message?.content||"").trim();
    if(!text)return json({error:"Pollinations no devolvió texto.",provider:"pollinations"},502);
    return json({ok:true,provider:"pollinations",model,text,usage:data.usage||null});
  }

  if (provider === "huggingface") {
    if (!getCredentialSlots(env,"huggingface").length) {
      return json({ error: "Hugging Face todavía no está configurado en los secretos de Cloudflare." }, 503);
    }

    const model = requestedModel || "openai/gpt-oss-20b:cheapest";
    const body = {
      model,
      messages: normalized.openaiMessages,
      temperature: Math.max(0, Math.min(1.2, Number(payload.temperature ?? 0.7))),
      max_tokens: clamp(payload.maxOutputTokens, 128, 1800, 900),
      stream: false,
    };

    let response;
    try {
      response = await requestWithCredentialPool(env,"huggingface", credential => fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + credential,
        },
        body: JSON.stringify(body),
      }));
    } catch {
      return json({ error: "No fue posible conectar con Hugging Face. Inténtalo nuevamente." }, 502);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if(response.status===402&&getCredentialSlots(env,"huggingface").length<=1)await setProviderHold(env,"huggingface","quota_exhausted","Hugging Face no tiene créditos disponibles (HTTP 402).",21600);
      if((response.status===401||response.status===403)&&getCredentialSlots(env,"huggingface").length<=1)await setProviderHold(env,"huggingface","auth_error","Revisa el token de Hugging Face y sus permisos de Inference Providers.",3600);
      const providerMessage = String(data.error?.message || data.error || "").slice(0, 240);
      let message = "Hugging Face respondió con un error (" + response.status + ").";
      if (response.status === 401 || response.status === 403) {
        message = "El token de Hugging Face no tiene permiso para llamar a Inference Providers. Revisa sus permisos.";
      } else if (response.status === 402) {
        message = "Hugging Face no tiene créditos disponibles para esta solicitud. El plan gratuito incluye un crédito mensual limitado; no se activará una recarga automática.";
      } else if (response.status === 429) {
        message = "Hugging Face o el proveedor seleccionado alcanzó su límite temporal. Prisma podrá intentar otro motor disponible.";
      }
      return json({ error: message, provider: "huggingface", status: response.status, detail: providerMessage }, response.status === 402 || response.status === 429 ? response.status : 502);
    }

    const text = String(data.choices?.[0]?.message?.content || "").trim();
    if (!text) return json({ error: "Hugging Face no devolvió texto. Comprueba la disponibilidad del modelo." }, 502);

    return json({
      ok: true,
      provider: "huggingface",
      model,
      text,
      usage: data.usage || null,
    });
  }

  if (provider === "groq") {
    if (!getCredentialSlots(env,"groq").length) return json({error:"Groq aún no tiene GROQ_API_KEY configurado en Cloudflare."},503);
    const model=requestedModel||"openai/gpt-oss-20b";
    let response;
    const askGroq=key=>fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
      body:JSON.stringify({model,messages:normalized.openaiMessages,temperature:0.65,max_completion_tokens:clamp(payload.maxOutputTokens,128,4096,1200),stream:false})
    });
    try{
      response=await requestWithCredentialPool(env,"groq",askGroq);
    }catch{
      if(getCredentialSlots(env,"groq").length<=1)await setProviderHold(env,"groq","network_error","Groq no respondió; Prisma lo pausó brevemente para evitar reintentos inútiles.",60);
      return json({error:"No fue posible conectar con Groq. Prisma lo pausará brevemente y probará otro motor.",provider:"groq",status:502,retryAfter:60},502);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const status=response.status;
      let holdSeconds=0;
      if(status===429)holdSeconds=Math.max(30,Math.min(300,Number(response.headers.get("retry-after")||90)));
      else if(status===401||status===403)holdSeconds=3600;
      else if([500,502,503,504].includes(status))holdSeconds=60;
      if(holdSeconds&&getCredentialSlots(env,"groq").length<=1)await setProviderHold(env,"groq",status===429?"rate_limited":status===401||status===403?"auth_error":"provider_unavailable",status===429?"Groq alcanzó un límite temporal; Prisma utilizará otro motor durante la pausa.":status===401||status===403?"Groq rechazó la clave configurada. Revisa GROQ_API_KEY en Cloudflare.":"Groq está temporalmente indisponible; Prisma probará otro motor.",holdSeconds);
      const message=status===429?"Groq alcanzó un límite temporal. Prisma cambiará automáticamente a otro proveedor.":status===401||status===403?"Groq rechazó la clave configurada. Revisa GROQ_API_KEY en Cloudflare.":"Groq respondió con un error ("+status+").";
      return json({error:message,provider:"groq",status,retryAfter:holdSeconds||null},status===429?429:status===400?400:502);
    }
    const text=String(data.choices?.[0]?.message?.content||"").trim();
    if(!text)return json({error:"Groq no devolvió texto."},502);
    return json({ok:true,provider:"groq",model,text,usage:data.usage||null});
  }

  if (provider === "cloudflare") {
    if(!env.AI?.run)return json({error:"Cloudflare Workers AI no está vinculado al backend."},503);
    const model=requestedModel||"@cf/google/gemma-4-26b-a4b-it";
    try {
      const data=await env.AI.run(model,{
        messages:normalized.openaiMessages,
        max_tokens:clamp(payload.maxOutputTokens,128,1700,900),
        temperature:0.6,
        stream:false
      });
      const text=String(data.response||data.choices?.[0]?.message?.content||"").trim();
      if(!text)return json({error:"Workers AI no devolvió texto. Prueba otro modelo."},502);
      return json({ok:true,provider:"cloudflare",model,text,usage:data.usage||null});
    }catch(error){
      console.error("Workers AI error",String(error?.message||error).slice(0,140));
      return json({error:"Cloudflare Workers AI no pudo completar la inferencia. Intenta otro motor."},502);
    }
  }

  if (provider === "kilo") {
    const model=requestedModel||"z-ai/glm-5:free";
    const key=getCredentialSlots(env,"kilo")[0]?.value||"";
    const hold=await getProviderHold(env,"kilo");
    if(hold)return json({error:hold.reason,provider:"kilo",status:429,retryAfter:hold.valid_until?Math.max(1,Number(hold.valid_until)-Math.floor(Date.now()/1000)):90},429);
    const headers={"Content-Type":"application/json"};
    if(key)headers.Authorization="Bearer "+key;
    let response;
    try{
      response=await fetch("https://ai-gateway.kilo.ai/api/v1/chat/completions",{
        method:"POST",headers,
        body:JSON.stringify({model,messages:normalized.openaiMessages,temperature:0.65,max_tokens:clamp(payload.maxOutputTokens,128,4096,1200),stream:false})
      });
    }catch{
      await setProviderHold(env,"kilo","network_error","Kilo Gateway no respondió; Prisma lo pausó brevemente.",60);
      return json({error:"No fue posible conectar con Kilo Gateway.",provider:"kilo"},502);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===429)await setProviderHold(env,"kilo","rate_limited","Kilo Gateway alcanzó el límite anónimo o de la clave; Prisma probará otro motor.",Math.max(30,Math.min(600,Number(response.headers.get("retry-after")||90))));
      else if(response.status===401||response.status===403)await setProviderHold(env,"kilo","auth_error","Kilo rechazó la clave opcional configurada.",3600);
      const message=response.status===429?"Kilo Gateway alcanzó su límite temporal.":response.status===401||response.status===403?"Kilo rechazó la clave opcional.":"Kilo Gateway respondió con un error ("+response.status+").";
      return json({error:message,provider:"kilo",status:response.status},response.status===429?429:502);
    }
    const content=data.choices?.[0]?.message?.content;
    const text=(typeof content==="string"?content:Array.isArray(content)?content.map(part=>part?.text||"").join("\\n"):"").trim();
    if(!text)return json({error:"Kilo Gateway no devolvió texto.",provider:"kilo"},502);
    return json({ok:true,provider:"kilo",model:data.model||model,text,usage:data.usage||null});
  }

  const compatibleProviders={
    sensenova:{url:"https://token.sensenova.cn/v1/chat/completions",model:"sensenova-6.8-flash-lite"},
    zai:{url:"https://api.z.ai/api/paas/v4/chat/completions",model:"glm-4.7-flash"},
    requesty:{url:"https://router.requesty.ai/v1/chat/completions",model:"nemotron-3.5-lightning-30b-a3b"},
    baidu:{url:"https://qianfan.baidubce.com/v2/chat/completions",model:"ernie-speed-128k"},
    aihubmix:{url:"https://aihubmix.com/v1/chat/completions",model:"coding-glm-5.3-free"},
    amd:{url:"https://developer.amd.com.cn/radeon/api/v1/chat/completions",model:null},
  };
  if(compatibleProviders[provider]){
    const config=compatibleProviders[provider];
    const model=requestedModel||(provider==="amd"?amdModels?.[0]?.id:config.model);
    if(!model)return json({error:"AMD Token Factory no devolvió modelos gratuitos de texto para esta clave. Revisa la cuenta y su aprobación regional.",provider},503);
    const extraHeaders=provider==="requesty"?{"HTTP-Referer":"https://prismaspace.pages.dev","X-Title":"Prisma Space"}:{};
    return callOpenAICompatibleProvider(env,provider,config.url,model,normalized.openaiMessages,payload,extraHeaders);
  }

  if (!getCredentialSlots(env,"gemini").length) {
    return json({ error: "Gemini todavía no está configurado en los secretos de Cloudflare." }, 503);
  }

  const model = String(payload.model || env.GEMINI_TEXT_MODEL || "gemini-3.8-flash");
  const allowedModels = new Set(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  if (!allowedModels.has(model)) {
    return json({ error: "El modelo solicitado no está habilitado para el uso compartido de Prisma." }, 400);
  }

  // Gemini 3.8 Flash rejects legacy sampling fields such as temperature.
  const generationConfig = {
    maxOutputTokens: clamp(payload.maxOutputTokens, 128, 4096, 2048),
  };
  const body = {
    contents: normalized.contents,
    generationConfig,
  };
  if (normalized.system.length) {
    body.systemInstruction = { parts: [{ text: normalized.system.join("\n\n").slice(0, 12000) }] };
  }

  const askGemini = (targetModel,key) => fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(targetModel) + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
  });

  let response, data, activeModel = model;
  try {
    response = await requestWithCredentialPool(env,"gemini",key=>askGemini(activeModel,key));
    data = await response.json().catch(() => ({}));
    if (model === "gemini-3.8-flash" && [502, 503].includes(response.status)) {
      // The higher-capability model can be temporarily overloaded; use a lower-cost model.
      activeModel = "gemini-3.5-flash-lite";
      response = await requestWithCredentialPool(env,"gemini",key=>askGemini(activeModel,key));
      data = await response.json().catch(() => ({}));
    }
  } catch {
    return json({ error: "No fue posible conectar con Google Gemini. Inténtalo nuevamente." }, 502);
  }
  if (!response.ok) {
    const providerMessage = String(data.error?.message || "").slice(0, 300);
    const message = response.status === 429
      ? "Gemini alcanzó su cuota o límite temporal. Prisma podrá probar otro motor cuando esté conectado."
      : "Gemini respondió con un error (" + response.status + ")." + (providerMessage ? " " + providerMessage : "");
    return json({ error: message, provider: "gemini", status: response.status }, response.status === 429 ? 429 : 502);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("").trim();
  if (!text) return json({ error: "Gemini no devolvió texto. Comprueba el modelo y sus límites." }, 502);

  return json({
    ok: true,
    provider: "gemini",
    model: activeModel,
    text,
    usage: data.usageMetadata || null,
  });
}
