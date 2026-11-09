import { getCredentialSlots } from "./credential-pool.js";

let cachedModels = [];
let cacheExpiresAt = 0;

// The public Kilo catalogue includes live prices. Only zero-input/zero-output
// chat models are exposed; paid models can never enter Prisma's allowlist.
export async function getKiloFreeModels(env, { force = false } = {}) {
  if (!force && cachedModels.length && Date.now() < cacheExpiresAt) return cachedModels;
  try {
    const headers = {};
    const key = getCredentialSlots(env, "kilo")[0]?.value;
    if (key) headers.Authorization = "Bearer " + key;
    const response = await fetch("https://ai-gateway.kilo.ai/api/v1/models", { headers });
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
        const chatLike = !/(image|video|audio|speech|embedding|transcrib|ocr)/i.test(id);
        return id && prompt === 0 && completion === 0 && textOutput && chatLike;
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
