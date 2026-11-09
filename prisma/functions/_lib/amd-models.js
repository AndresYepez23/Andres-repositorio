import { getCredentialSlots } from "./credential-pool.js";

let cachedModels = [];
let cacheExpiresAt = 0;

// AMD documents this catalogue as cheap to call and identical for all Token
// Factory keys. Cache it briefly, then filter strictly to zero-cost text models.
export async function getAmdFreeModels(env, { force = false } = {}) {
  const credential = getCredentialSlots(env, "amd")[0]?.value;
  if (!credential) return [];
  if (!force && cachedModels.length && Date.now() < cacheExpiresAt) return cachedModels;
  try {
    const response = await fetch("https://developer.amd.com.cn/radeon/api/v1/models", {
      headers: { Authorization: "Bearer " + credential },
    });
    if (!response.ok) {
      cacheExpiresAt = Date.now() + 30_000;
      return [];
    }
    const payload = await response.json().catch(() => ({}));
    const models = Array.isArray(payload.data) ? payload.data : [];
    cachedModels = models
      .filter(model => model?.free === true
        && Array.isArray(model.architecture?.input_modalities)
        && model.architecture.input_modalities.includes("text")
        && Array.isArray(model.architecture?.output_modalities)
        && model.architecture.output_modalities.includes("text"))
      .map(model => ({
        id: String(model.id),
        name: String(model.name || model.id),
        specialty: String(model.description || "Modelo de texto gratuito de AMD Token Factory").slice(0, 180),
      }));
    cacheExpiresAt = Date.now() + 5 * 60_000;
    return cachedModels;
  } catch (error) {
    console.warn("AMD Token Factory model catalogue unavailable", error?.message || error);
    cacheExpiresAt = Date.now() + 30_000;
    return [];
  }
}
