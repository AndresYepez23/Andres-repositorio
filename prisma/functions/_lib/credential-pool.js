// Six protected credential slots for every external provider except Groq (five).
// Quotas remain governed by each account/project and by Prisma's shared D1 limits.
// Never expose credential values to the browser, logs or status endpoints.
import { getProviderHold, setProviderHold } from "./provider-health.js";

export const CREDENTIAL_ROOTS = Object.freeze({
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HF_TOKEN",
  openrouter: "OPENROUTER_API_KEY",
  pollinations: "POLLINATIONS_API_KEY",
});
export const CREDENTIAL_SLOT_LIMITS = Object.freeze({
  gemini: 6,
  groq: 5,
  huggingface: 6,
  openrouter: 6,
  pollinations: 6,
});
// Backwards-compatible global maximum; use maxCredentialSlots(provider)
// whenever displaying or enumerating an individual provider's slots.
export const MAX_CREDENTIAL_SLOTS = 6;
export function maxCredentialSlots(provider) {
  return CREDENTIAL_SLOT_LIMITS[provider] || 0;
}

export function getCredentialSlots(env, provider) {
  const root = CREDENTIAL_ROOTS[provider];
  if (!root) return [];
  const seen = new Set(), slots = [];
  const limit = maxCredentialSlots(provider);
  for (let number = 1; number <= limit; number++) {
    const name = number === 1 ? root : root + "_" + number;
    // _BACKUP is a legacy alias for slot 2, not a sixth credential.
    const value = String((number === 2 ? env?.[name] || env?.[root + "_BACKUP"] : env?.[name]) || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    slots.push({ number, name, value });
  }
  return slots;
}

export function getCredentialStatus(env, provider) {
  const occupied = new Set(getCredentialSlots(env, provider).map(item => item.number));
  const max = maxCredentialSlots(provider);
  return {
    count: occupied.size,
    max,
    slots: Array.from({ length: max }, (_, i) => ({
      slot: i + 1,
      configured: occupied.has(i + 1),
      variable: CREDENTIAL_ROOTS[provider] + (i ? "_" + (i + 1) : ""),
    })),
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

// One network call in the healthy path, at most two per request for
// key-specific auth/network faults. Provider-wide 402/429 responses stop the
// whole provider pool: never rotate accounts to evade credit or rate limits.
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

  const maxAttempts = Math.min(2, Math.max(1, Number(options.maxAttempts) || 2));
  const retryable = new Set(options.retryStatuses || [401, 403, 500, 502, 503, 504]);
  let lastResponse, lastError, attempted = 0;

  for (const slot of slots) {
    if (attempted >= maxAttempts) break;
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
