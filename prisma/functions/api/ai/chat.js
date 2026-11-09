import { getProviderHold, setProviderHold } from "../../_lib/provider-health.js";
import { allowedModel } from "../../_lib/model-catalog.js";
import { checkLimits } from "../../_lib/limits.js";
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
  if (!["gemini", "huggingface", "groq", "cloudflare", "pollinations"].includes(provider)) {
    return json({ error: "Este proveedor todavía no está habilitado en el backend central." }, 501);
  }

  let normalized;
  try {
    normalized = normalizeMessages(payload.messages);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const requestedModel = String(payload.model || "");
  if (requestedModel && !allowedModel(provider, "chat", requestedModel)) {
    return json({error:"Modelo no permitido para el proveedor seleccionado."},400);
  }
  if(provider==="pollinations"){
    const hold=await getProviderHold(env,"pollinations");
    if(hold)return json({error:hold.reason,provider:"pollinations",status:402},402);
  }
  if(provider==="huggingface"){
    const hold=await getProviderHold(env,"huggingface");
    if(hold)return json({error:hold.reason,provider:"huggingface",status:402},402);
  }
  if(provider==="groq"){
    const hold=await getProviderHold(env,"groq");
    if(hold)return json({error:hold.reason,provider:"groq",status:429,retryAfter:hold.valid_until?Math.max(1,Number(hold.valid_until)-Math.floor(Date.now()/1000)):90},429);
  }
  const limitError = await checkLimits(env, request, provider);
  if (limitError) return json({error:limitError.error},limitError.status);

  if (provider === "pollinations") {
    if (!env.POLLINATIONS_API_KEY) return json({error:"Pollinations compartido aún no está activado. Configura POLLINATIONS_API_KEY como secreto de producción; Pollinations Connect personal sigue disponible.",provider:"pollinations"},503);
    const model=requestedModel||"openai/gpt-5.4-nano";
    let response;
    try {
      response=await fetch("https://gen.pollinations.ai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.POLLINATIONS_API_KEY},
        body:JSON.stringify({model,messages:normalized.openaiMessages,temperature:0.7,max_tokens:clamp(payload.maxOutputTokens,128,2200,800),stream:false})
      });
    } catch {
      return json({error:"No fue posible conectar con Pollinations. Prisma probará otro motor.",provider:"pollinations"},502);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===402)await setProviderHold(env,"pollinations","quota_exhausted","Pollinations no dispone de saldo autorizado. Prisma usará los demás motores.",21600);
      if(response.status===401||response.status===403)await setProviderHold(env,"pollinations","auth_error","La clave central Pollinations no está autorizada. Revisa el secreto en Cloudflare.",3600);
      const message=response.status===429?"Pollinations alcanzó su límite temporal.":response.status===402?"Pollinations no dispone de saldo autorizado.":"Pollinations respondió con un error ("+response.status+").";
      return json({error:message,provider:"pollinations",status:response.status},response.status===429?429:response.status===402?402:502);
    }
    const text=String(data.choices?.[0]?.message?.content||"").trim();
    if(!text)return json({error:"Pollinations no devolvió texto.",provider:"pollinations"},502);
    return json({ok:true,provider:"pollinations",model,text,usage:data.usage||null});
  }

  if (provider === "huggingface") {
    if (!env.HF_TOKEN) {
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
      response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + env.HF_TOKEN,
        },
        body: JSON.stringify(body),
      });
    } catch {
      return json({ error: "No fue posible conectar con Hugging Face. Inténtalo nuevamente." }, 502);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if(response.status===402)await setProviderHold(env,"huggingface","quota_exhausted","Hugging Face no tiene créditos disponibles (HTTP 402).",21600);
      if(response.status===401||response.status===403)await setProviderHold(env,"huggingface","auth_error","Revisa el token de Hugging Face y sus permisos de Inference Providers.",3600);
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
    if (!env.GROQ_API_KEY) return json({error:"Groq aún no tiene GROQ_API_KEY configurado en Cloudflare."},503);
    const model=requestedModel||"openai/gpt-oss-20b";
    let response;
    try{
      response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.GROQ_API_KEY},
        body:JSON.stringify({model,messages:normalized.openaiMessages,temperature:0.65,max_completion_tokens:clamp(payload.maxOutputTokens,128,4096,1200),stream:false})
      });
    }catch{
      await setProviderHold(env,"groq","network_error","Groq no respondió; Prisma lo pausó brevemente para evitar reintentos inútiles.",60);
      return json({error:"No fue posible conectar con Groq. Prisma lo pausará brevemente y probará otro motor.",provider:"groq",status:502,retryAfter:60},502);
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const status=response.status;
      let holdSeconds=0;
      if(status===429)holdSeconds=Math.max(30,Math.min(300,Number(response.headers.get("retry-after")||90)));
      else if(status===401||status===403)holdSeconds=3600;
      else if([500,502,503,504].includes(status))holdSeconds=60;
      if(holdSeconds)await setProviderHold(env,"groq",status===429?"rate_limited":status===401||status===403?"auth_error":"provider_unavailable",status===429?"Groq alcanzó un límite temporal; Prisma utilizará otro motor durante la pausa.":status===401||status===403?"Groq rechazó la clave configurada. Revisa GROQ_API_KEY en Cloudflare.":"Groq está temporalmente indisponible; Prisma probará otro motor.",holdSeconds);
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

  if (!env.GEMINI_API_KEY) {
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

  const askGemini = targetModel => fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(targetModel) + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  let response, data, activeModel = model;
  try {
    response = await askGemini(activeModel);
    data = await response.json().catch(() => ({}));
    if (model === "gemini-3.8-flash" && [502, 503].includes(response.status)) {
      // The higher-capability model can be temporarily overloaded; use a lower-cost model.
      activeModel = "gemini-3.5-flash-lite";
      response = await askGemini(activeModel);
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
