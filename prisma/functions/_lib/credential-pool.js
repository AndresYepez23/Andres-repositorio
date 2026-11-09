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

function retryHoldSeconds(status, headers) {
  if (status === 401 || status === 403) return 3600;
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
    throw error;
  }

  const providerHold = await getProviderHold(env, provider);
  if (providerHold) {
    const error = new Error(providerHold.reason || "El proveedor está temporalmente en pausa.");
    error.code = "PROVIDER_COOLDOWN";
    error.status = providerHold.state === "quota_exhausted" ? 402 : 429;
    error.retryAfter = Math.max(1, Number(providerHold.valid_until || 0) - Math.floor(Date.now() / 1000));
    throw error;
  }

  const maxAttempts = Math.min(slots.length, 2, Math.max(1, Number(options.maxAttempts) || 2));
  const startIndex = Number.isInteger(options.startIndex)
    ? ((options.startIndex % slots.length) + slots.length) % slots.length
    : Math.floor(Math.random() * slots.length);
  const retryable = new Set(options.retryStatuses || [401, 403, 500, 502, 503, 504]);
  let lastResponse, lastError, attempted = 0;

  for (let offset = 0; offset < slots.length && attempted < maxAttempts; offset++) {
    const slot = slots[(startIndex + offset) % slots.length];
    const healthKey = "credential-slot:" + provider + ":" + slot.number;
    const hold = await getProviderHold(env, healthKey);
    if (hold) continue;

    attempted++;
    try {
      const response = await send(slot.value, slot.number);
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

      if (!retryable.has(response.status)) return response;
      await setProviderHold(env, healthKey,
        response.status === 401 || response.status === 403 ? "auth_error" : "provider_error",
        "Esta credencial requiere una pausa temporal; se probará como máximo una clave alternativa.", retryHoldSeconds(response.status, response.headers));
    } catch (error) {
      lastError = error;
      await setProviderHold(env, healthKey, "network_error",
        "La conexión de este espacio de credenciales falló.", 60);
    }
  }

  if (lastResponse) return lastResponse;
  const error = lastError || new Error("Todas las credenciales configuradas están temporalmente en pausa.");
  if (!lastError) error.code = "CREDENTIALS_PAUSED";
  throw error;
}
