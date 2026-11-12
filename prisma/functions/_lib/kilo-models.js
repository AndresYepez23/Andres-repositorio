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
