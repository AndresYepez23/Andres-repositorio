// Curated, server-controlled model allowlists. Never trust client supplied model IDs.
export const CHAT_MODELS = {
  huggingface: [
    {id:"openai/gpt-oss-20b:cheapest",name:"GPT-OSS 20B",specialty:"Chat rápido y económico"},
    {id:"openai/gpt-oss-120b:cheapest",name:"GPT-OSS 120B",specialty:"Razonamiento avanzado"},
    {id:"Qwen/Qwen3-4B-Thinking-2507:cheapest",name:"Qwen 3 Thinking 4B",specialty:"Razonamiento ligero"},
    {id:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",name:"Qwen 2.5 Coder 32B",specialty:"Programación"},
    {id:"deepseek-ai/DeepSeek-R1:cheapest",name:"DeepSeek R1",specialty:"Investigación y razonamiento complejo"},
    {id:"google/gemma-3-27b-it:cheapest",name:"Gemma 3 27B",specialty:"Chat e instrucciones"}
  ],
  groq: [
    {id:"openai/gpt-oss-20b",name:"GPT-OSS 20B",specialty:"Rapidez"},
    {id:"openai/gpt-oss-120b",name:"GPT-OSS 120B",specialty:"Razonamiento"}
  ],
  cloudflare: [
    {id:"@cf/google/gemma-4-26b-a4b-it",name:"Gemma 4 26B",specialty:"Chat y razonamiento"},
    {id:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",name:"Llama 3.3 70B Fast",specialty:"Alternativa de chat"}
  ],
  gemini: [
    {id:"gemini-3.5-flash-lite",name:"Gemini Flash-Lite",specialty:"Respuestas breves"},
    {id:"gemini-3.8-flash",name:"Gemini Flash",specialty:"Tareas complejas"}
  ]
};
export const IMAGE_MODELS = {
  cloudflare: [{id:"@cf/black-forest-labs/flux-1-schnell",name:"FLUX.1 Schnell",specialty:"Generación de imágenes con Workers AI"}],
  // Higher-cost inference. Enabled only with HF_MEDIA_ENABLED=1.
  huggingface: [{id:"stabilityai/stable-diffusion-3-medium-diffusers",name:"Stable Diffusion 3 Medium",specialty:"Generación de imágenes con HF Inference"}]
};
export const AUDIO_MODELS = {
  groq: [{id:"whisper-large-v3-turbo",name:"Whisper Large V3 Turbo",specialty:"Transcripción rápida"}],
  huggingface: [{id:"openai/whisper-large-v3",name:"Whisper Large V3",specialty:"Transcripción (reserva no habilitada)"}]
};
export function allowedModel(provider, type, model) {
  const catalog = type==="image" ? IMAGE_MODELS : type==="audio" ? AUDIO_MODELS : CHAT_MODELS;
  return !!catalog[provider]?.some(x=>x.id===model);
}
export function modelsForUI() {
  return {chat:CHAT_MODELS,image:IMAGE_MODELS,audio:AUDIO_MODELS};
}
