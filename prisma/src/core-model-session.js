export const MODEL_SESSION_IDLE_MS = 30 * 60 * 1000;

const safeText = (value, max = 180) => String(value || "").trim().slice(0, max);
const validProvider = value => /^[a-z0-9-]{2,25}$/i.test(String(value || ""));

export function normalizeConversationModelSelection(input = {}) {
  const mode = input?.mode === "manual" ? "manual" : "auto";
  const provider = validProvider(input?.provider) ? String(input.provider) : "";
  const model = safeText(input?.model);
  const requestedProvider = validProvider(input?.requestedProvider) ? String(input.requestedProvider) : "";
  const requestedModel = safeText(input?.requestedModel);
  return {
    mode,
    provider: provider && model ? provider : "",
    model: provider && model ? model : "",
    requestedProvider: mode === "manual" ? requestedProvider : "",
    requestedModel: mode === "manual" ? requestedModel : "",
    source: ["manual", "auto", "fallback"].includes(input?.source) ? input.source : mode,
    fallbackFrom: safeText(input?.fallbackFrom, 40),
    fallbackReason: safeText(input?.fallbackReason, 220),
    lastUserAt: Math.max(0, Number(input?.lastUserAt) || 0),
    selectedAt: Math.max(0, Number(input?.selectedAt) || 0),
    usedAt: Math.max(0, Number(input?.usedAt) || 0)
  };
}

export function beginConversationModelTurn(input, now = Date.now()) {
  const current = normalizeConversationModelSelection(input);
  const idle = current.lastUserAt > 0 && now - current.lastUserAt >= MODEL_SESSION_IDLE_MS;
  if (!idle) return { ...current, lastUserAt: now };

  // A manual choice remains the user's preference. After inactivity, retry it
  // once; if it is still unavailable, the normal fallback chain takes over.
  if (current.mode === "manual" && current.requestedProvider && current.requestedModel) {
    return {
      ...current,
      provider: current.requestedProvider,
      model: current.requestedModel,
      source: "manual",
      fallbackFrom: "",
      fallbackReason: "",
      lastUserAt: now,
      selectedAt: now,
      usedAt: 0
    };
  }

  // Automatic chats re-evaluate the best model on the next message after
  // 30 minutes without user activity, using the latest provider health/latency.
  return {
    ...current,
    mode: "auto",
    provider: "",
    model: "",
    requestedProvider: "",
    requestedModel: "",
    source: "auto",
    fallbackFrom: "",
    fallbackReason: "",
    lastUserAt: now,
    selectedAt: now,
    usedAt: 0
  };
}

export function selectManualConversationModel(input, provider, model, now = Date.now()) {
  if (!validProvider(provider) || !safeText(model)) return normalizeConversationModelSelection(input);
  const current = normalizeConversationModelSelection(input);
  return {
    ...current,
    mode: "manual",
    provider: String(provider),
    model: safeText(model),
    requestedProvider: String(provider),
    requestedModel: safeText(model),
    source: "manual",
    fallbackFrom: "",
    fallbackReason: "",
    selectedAt: now,
    usedAt: 0
  };
}

export function selectAutomaticConversationModel(input, now = Date.now()) {
  const current = normalizeConversationModelSelection(input);
  return {
    ...current,
    mode: "auto",
    provider: "",
    model: "",
    requestedProvider: "",
    requestedModel: "",
    source: "auto",
    fallbackFrom: "",
    fallbackReason: "",
    selectedAt: now,
    usedAt: 0
  };
}

export function pinConversationModel(input, result = {}, now = Date.now()) {
  const current = normalizeConversationModelSelection(input);
  const provider = validProvider(result.provider) ? String(result.provider) : "";
  const model = safeText(result.model);
  if (!provider || !model) return current;
  const fallbackFrom = safeText(result.fallbackFrom, 40);
  return {
    ...current,
    provider,
    model,
    source: fallbackFrom ? "fallback" : current.mode === "manual" ? "manual" : "auto",
    fallbackFrom,
    fallbackReason: safeText(result.fallbackReason, 220),
    selectedAt: now,
    usedAt: now
  };
}

// Keep the catalogue visible without sending requests to unavailable providers.
// Availability is decided by the backend; display never overrides automatic routing.
export function coreProviderPickerState({available=false,configured=false,personal=false,reason='',models=[]}={}){
  const count=Array.isArray(models)?models.length:0;
  const connected=Boolean(configured||personal);
  const selectable=Boolean(available||personal)&&count>0;
  return {
    visible:count>0||connected||Boolean(available),
    selectable,
    status:selectable?'Disponible':connected?'Temporalmente no disponible':'Sin configurar',
    reason:selectable?'':String(reason||'').trim()||
      (count===0?'Sin modelos de chat verificados':connected?'Temporalmente no disponible':'Sin credenciales centrales configuradas')
  };
}

export function conversationModelRequest(input) {
  const current = normalizeConversationModelSelection(input);
  return current.provider && current.model
    ? { provider: current.provider, model: current.model, allowFallback: true }
    : { provider: "auto", model: "", allowFallback: true };
}
