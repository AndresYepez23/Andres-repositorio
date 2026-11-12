import { getCredentialSlots, requestWithCredentialPool } from "./credential-pool.js";

let cache = { keyTag: "", expiresAt: 0, models: [] };
const NON_CHAT_OUTPUTS = new Set([
  "gpt-image-2-free",
  "gemini-3.1-flash-image-preview-free",
  "wan3.0-video-free",
  "wan3.0-video-prime-free",
]);

// AIHubMix publishes its model list and free-tier request weights separately.
// We fail closed if either source is unavailable, and only expose zero-cost
// text-output models whose request weight is exactly one.
export async function getAihubmixFreeModels(env, { force = false } = {}) {
  const slots = getCredentialSlots(env, "aihubmix");
  if (!slots.length) return [];
  const keyTag = slots.map(slot => slot.value.slice(-8)).join(":");
  if (!force && cache.keyTag === keyTag && Date.now() < cache.expiresAt) return cache.models;

  try {
    const [modelsResponse, quotaResponse] = await Promise.all([
      requestWithCredentialPool(env, "aihubmix", key =>
        fetch("https://aihubmix.com/v1/models", {
          headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        }),
        { countRequest: false, sweepAuthSlots: true, sweepQuotaSlots: true, retryStatuses: [401,403] }
      ),
      fetch("https://aihubmix.com/call/free_quota_config", {
        headers: { Accept: "application/json" },
      }),
    ]);
    if (!modelsResponse.ok || !quotaResponse.ok) {
      cache = { keyTag, expiresAt: Date.now() + 30_000, models: [] };
      return [];
    }

    const [modelPayload, quotaPayload] = await Promise.all([
      modelsResponse.json(),
      quotaResponse.json(),
    ]);
    const models = Array.isArray(modelPayload?.data) ? modelPayload.data : [];
    const quota = quotaPayload?.data;
    const weights = quota?.weight_map;
    if (!models.length || !quotaPayload?.success || !weights || typeof weights !== "object") {
      cache = { keyTag, expiresAt: Date.now() + 30_000, models: [] };
      return [];
    }

    const freeModels = models.filter(model => {
      const id = String(model?.id || "");
      if (!id.endsWith("-free") || NON_CHAT_OUTPUTS.has(id)) return false;
      const weight = Number(weights[id] ?? 1);
      if (!Number.isFinite(weight) || weight !== 1) return false;

      const pricing = model?.pricing;
      if (pricing && (
        (pricing.prompt != null && Number(pricing.prompt) !== 0) ||
        (pricing.completion != null && Number(pricing.completion) !== 0)
      )) return false;

      const outputs = model?.architecture?.output_modalities || model?.output_modalities;
      if (Array.isArray(outputs) && !outputs.includes("text")) return false;
      // These three current listings do not publish their output modality.
      if (!Array.isArray(outputs) && ["elephant-1-free", "mammoth-1-free", "span-01-lite-free"].includes(id)) return false;
      return true;
    }).map(model => ({
      id: String(model.id),
      name: String(model.name || model.id),
      specialty: "Gratis · precio cero verificado · peso de cuota 1",
    }));

    const preferred = [
      "coding-glm-5.3-free",
      "qwen3.8-flash-free",
      "gemini-3.8-flash-free",
      "coding-kimi-k3-free",
      "xiaomi-mimo-v2.6-pro-free",
    ];
    freeModels.sort((a, b) => {
      const ai = preferred.indexOf(a.id), bi = preferred.indexOf(b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });

    cache = { keyTag, expiresAt: Date.now() + 5 * 60_000, models: freeModels };
    return freeModels;
  } catch (error) {
    console.warn("AIHubMix free model catalogue unavailable", error?.message || error);
    cache = { keyTag, expiresAt: Date.now() + 30_000, models: [] };
    return [];
  }
}
