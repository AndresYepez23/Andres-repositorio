// Up to six protected API credentials per external provider.
// Compact JSON pools keep Cloudflare binding usage practical; individual legacy
// variables remain supported. Provider quotas are shared and never multiplied
// by the number of keys. Secret values never leave the backend.
import { getProviderHold, setProviderHold } from "./provider-health.js";

export const CREDENTIAL_ROOTS = Object.freeze({
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HF_TOKEN",
  openrouter: "OPENROUTER_API_KEY",
  pollinations: "POLLINATIONS_API_KEY",
  kilo: "KILO_API_KEY",
  requesty: "REQUESTY_API_KEY",
  sensenova: "SENSENOVA_API_KEY",
  zai: "ZAI_API_KEY",
  aihubmix: "AIHUBMIX_API_KEY",
});

// One encrypted Cloudflare secret per provider can contain a JSON array of up
// to six keys. This is the recommended format on Workers Free, whose binding
// count is lower than the 72 individual secrets needed for twelve providers.
export const CREDENTIAL_POOL_VARIABLES = Object.freeze({
  gemini: "GEMINI_API_KEYS_JSON",
  groq: "GROQ_API_KEYS_JSON",
  huggingface: "HF_API_KEYS_JSON",
  openrouter: "OPENROUTER_API_KEYS_JSON",
  pollinations: "POLLINATIONS_API_KEYS_JSON",
  kilo: "KILO_API_KEYS_JSON",
  requesty: "REQUESTY_API_KEYS_JSON",
  sensenova: "SENSENOVA_API_KEYS_JSON",
  zai: "ZAI_API_KEYS_JSON",
  aihubmix: "AIHUBMIX_API_KEYS_JSON",
});

export const CREDENTIAL_SLOT_LIMITS = Object.freeze(
  Object.fromEntries(Object.keys(CREDENTIAL_ROOTS).map(provider => [provider, provider === "requesty" ? 3 : 6]))
);
export const MAX_CREDENTIAL_SLOTS = 6;

export function maxCredentialSlots(provider) {
  return CREDENTIAL_SLOT_LIMITS[provider] || 0;
}

function readJsonCredentialPool(env, provider) {
  const variable = CREDENTIAL_POOL_VARIABLES[provider];
  const raw = variable ? env?.[variable] : null;
  if (raw == null || raw === "") return { variable, configured: false, valid: true, values: [] };
  if (typeof raw !== "string") return { variable, configured: true, valid: false, values: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > maxCredentialSlots(provider)
      || parsed.some(value => typeof value !== "string")) {
      return { variable, configured: true, valid: false, values: [] };
    }
    return {
      variable,
      configured: true,
      valid: true,
      values: parsed.map(value => value.trim()),
    };
  } catch {
    return { variable, configured: true, valid: false, values: [] };
  }
}

export function getCredentialSlots(env, provider) {
  const root = CREDENTIAL_ROOTS[provider];
  if (!root) return [];
  const seen = new Set(), slots = [];
  const limit = maxCredentialSlots(provider);
  const pool = readJsonCredentialPool(env, provider);

  for (let number = 1; number <= limit; number++) {
    const individualName = number === 1 ? root : root + "_" + number;
    const legacyBackupName = number === 2 ? root + "_BACKUP" : null;
    const individualValue = String(
      env?.[individualName] || (legacyBackupName ? env?.[legacyBackupName] : "") || ""
    ).trim();
    const pooledValue = pool.values[number - 1] || "";
    const value = individualValue || pooledValue;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    slots.push({
      number,
      name: individualValue
        ? (env?.[individualName] ? individualName : legacyBackupName)
        : pool.variable + "[" + number + "]",
      value,
    });
  }
  return slots;
}

export function getCredentialStatus(env, provider) {
  const slots = getCredentialSlots(env, provider);
  const byNumber = new Map(slots.map(item => [item.number, item]));
  const root = CREDENTIAL_ROOTS[provider];
  const pool = readJsonCredentialPool(env, provider);
  const max = maxCredentialSlots(provider);
  return {
    count: slots.length,
    max,
    poolVariable: pool.variable,
    poolConfigured: pool.configured,
    poolValid: pool.valid,
    slots: Array.from({ length: max }, (_, i) => {
      const number = i + 1;
      const configured = byNumber.get(number);
      return {
        slot: number,
        configured: Boolean(configured),
        variable: configured?.name || pool.variable + "[" + number + "]",
        individualVariable: number === 1 ? root : root + "_" + number,
      };
    }),
  };
}

async function credentialHealthKey(provider, slot) {
  // Cooldowns belong to the actual credential, not just its slot position.
  // Updating a secret must not inherit the previous invalid key's one-hour hold.
  const bytes=new TextEncoder().encode(slot.value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const tag=Array.from(new Uint8Array(digest).slice(0,8),b=>b.toString(16).padStart(2,'0')).join('');
  return "credential-slot:v2:" + provider + ":" + slot.number + ":" + tag;
}
export async function getCredentialHealthSnapshot(env, providers=Object.keys(CREDENTIAL_ROOTS)) {
  const names=[...new Set((Array.isArray(providers)?providers:[]).filter(name=>CREDENTIAL_ROOTS[name]))];
  const slotsByProvider=Object.fromEntries(names.map(name=>[name,getCredentialSlots(env,name)]));
  const snapshot=Object.fromEntries(names.map(name=>[name,{
    configuredSlots:slotsByProvider[name].length,
    healthySlots:slotsByProvider[name].length,
    pausedSlots:0,
    retryAt:null
  }]));
  const db=env?.PRISMA_RATE_DB;
  if(!db?.prepare)return snapshot;

  let rows=[];
  try {
    const result=await db.prepare(
      "SELECT provider, state, reason, valid_until FROM ai_provider_health WHERE provider LIKE ? AND valid_until>?"
    ).bind("credential-slot:v2:%",Math.floor(Date.now()/1000)).all();
    rows=Array.isArray(result?.results)?result.results:[];
  } catch(error) {
    console.error("Prisma credential health snapshot",String(error?.message||error).slice(0,100));
    return snapshot;
  }

  const holds=new Map(rows.map(row=>[String(row.provider||""),row]));
  for(const name of names){
    let pausedSlots=0,retryAt=null;
    for(const slot of slotsByProvider[name]){
      const key=await credentialHealthKey(name,slot);
      const hold=holds.get(key);
      if(!hold)continue;
      pausedSlots++;
      const until=Number(hold.valid_until)||0;
      if(until>0&&(!retryAt||until<retryAt))retryAt=until;
    }
    snapshot[name]={
      configuredSlots:slotsByProvider[name].length,
      healthySlots:Math.max(0,slotsByProvider[name].length-pausedSlots),
      pausedSlots,
      retryAt
    };
  }
  return snapshot;
}

export async function getHealthyCredentialCount(env,provider) {
  const snapshot=await getCredentialHealthSnapshot(env,[provider]);
  return snapshot[provider]?.healthySlots||0;
}

function retryHoldSeconds(status, headers) {
  if (status === 401) return 120;
  if (status === 402) return 3600;
  if (status === 429) {
    const seconds = Number(headers?.get?.("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(600, Math.max(30, seconds)) : 90;
  }
  return 60;
}

// Distribute healthy requests across configured credentials. A key-specific
// auth/transient failure can try one alternate at most. Provider-wide 402/429
// pauses the entire pool: keys are never rotated to evade billing or quotas.
export async function requestWithCredentialPool(env, provider, send, options = {}) {
  const slots = getCredentialSlots(env, provider);
  if (!slots.length) {
    const error = new Error("No existe una credencial configurada para este proveedor.");
    error.code = "MISSING_CREDENTIAL";
    error.status = 503;
    throw error;
  }

  const providerHold = await getProviderHold(env, provider);
  if (providerHold) {
    const error = new Error(providerHold.reason || "El proveedor está temporalmente en pausa.");
    error.code = providerHold.state === "quota_exhausted" || providerHold.state === "rate_limited"
      ? "PROVIDER_LIMIT" : "PROVIDER_COOLDOWN";
    error.status = providerHold.state === "quota_exhausted" ? 402
      : providerHold.state === "rate_limited" ? 429 : 503;
    error.retryAfter = Math.max(1, Number(providerHold.valid_until || 0) - Math.floor(Date.now() / 1000));
    throw error;
  }

  // API keys are alternatives only for key-specific authentication failures.
  // 402/429 are provider-wide limits; 5xx/network failures are endpoint health
  // problems and must not trigger duplicate paid/quota-consuming requests.
  const sweepAuthSlots = options.sweepAuthSlots === true;
  const maxAttempts = Math.min(slots.length,
    sweepAuthSlots ? maxCredentialSlots(provider) : Math.min(2, Math.max(1, Number(options.maxAttempts) || 2)));
  const startIndex = Number.isInteger(options.startIndex)
    ? ((options.startIndex % slots.length) + slots.length) % slots.length
    : Math.floor(Math.random() * slots.length);
  const retryable = new Set(options.retryStatuses || [401]);
  let lastResponse, attempted = 0, earliestPausedUntil = 0;

  for (let offset = 0; offset < slots.length && attempted < maxAttempts; offset++) {
    const slot = slots[(startIndex + offset) % slots.length];
    const healthKey = await credentialHealthKey(provider, slot);
    const hold = await getProviderHold(env, healthKey);
    if (hold) {
      const until=Number(hold.valid_until)||0;
      if(until>0&&(!earliestPausedUntil||until<earliestPausedUntil))earliestPausedUntil=until;
      continue;
    }

    attempted++;
    let response;
    try {
      response = await send(slot.value, slot.number);
    } catch(error) {
      const seconds=error?.name==="AbortError"?45:30;
      await setProviderHold(env, provider, "network_error",
        "El endpoint de "+provider+" no respondió; Prisma lo pausó brevemente para evitar reintentos inútiles.", seconds);
      error.code=error.code||"PROVIDER_UNAVAILABLE";
      error.status=Number(error.status)||502;
      error.retryAfter=Number(error.retryAfter)||seconds;
      throw error;
    }
    lastResponse = response;

    if (response.ok) return response;

    if (response.status === 402) {
      await setProviderHold(env, provider, "quota_exhausted",
        "El proveedor agotó el saldo o crédito disponible; Prisma pausó el conjunto de credenciales sin probar otras cuentas.", 21600);
      return response;
    }
    if (response.status === 429) {
      await setProviderHold(env, provider, "rate_limited",
        "El proveedor alcanzó un límite de solicitudes; Prisma pausó el proveedor y utilizará otro motor.", retryHoldSeconds(429, response.headers));
      return response;
    }
    if ([408, 500, 502, 503, 504].includes(response.status)) {
      const seconds=response.status===408?30:45;
      await setProviderHold(env, provider, "provider_unavailable",
        "El endpoint de "+provider+" está temporalmente indisponible; Prisma cambiará de motor y volverá a comprobarlo después.", seconds);
      return response;
    }

    if (!retryable.has(response.status)) return response;

    // A 401 belongs to this credential only. Try a different key without
    // treating the whole provider as exhausted; a 403 can be model permission.
    if (response.status === 401) {
      await setProviderHold(env, healthKey, "auth_error",
        "El proveedor devolvió HTTP 401; reintentaremos esta clave en dos minutos.", retryHoldSeconds(401, response.headers));
    }
  }

  if (lastResponse) return lastResponse;

  const error = new Error(earliestPausedUntil
    ? "Todas las credenciales disponibles de "+provider+" están temporalmente en pausa."
    : "Todas las credenciales configuradas de "+provider+" están temporalmente en pausa.");
  error.code = "CREDENTIALS_PAUSED";
  error.status = 503;
  error.retryAfter = earliestPausedUntil
    ? Math.max(1,earliestPausedUntil-Math.floor(Date.now()/1000)) : 60;
  throw error;
}
