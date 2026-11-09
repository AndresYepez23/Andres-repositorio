// Curated, server-controlled model allowlists. Never trust client supplied model IDs.
// Current AIHubMix free chat catalogue. Image/video-output models are deliberately
// excluded here; those require their dedicated media endpoints and response handling.
const AIHUBMIX_FREE_CHAT_IDS = [
 "agents-a1-free","coding-glm-4.6-free","coding-glm-4.7-free","coding-glm-5-free",
 "coding-glm-5-turbo-free","coding-glm-5.1-free","coding-glm-5.2-free","coding-glm-5.3-flash-free",
 "coding-glm-5.3-free","coding-kimi-k3-free","coding-minimax-m2-free","coding-minimax-m2.1-free",
 "coding-minimax-m2.5-free","coding-minimax-m2.7-free","coding-minimax-m3-free","crouton-alpha-free",
 "dots-3-note-preview-free","flint-v1.0-free","gemma-4-26b-a4b-it-free","gemma-4-31b-it-free",
 "glm-4.7-flash-free","intern-s2-free","k2.6-code-preview-free","kimi-for-coding-free",
 "lfm-2.5-2.6b-free","mimo-v2-flash-free","nemotron-3-nano-omni-30b-a3b-reasoning-free",
 "nemotron-3-ultra-550b-a55b-free","nemotron-3.5-content-safety-free","nemotron-3.5-lightning-free",
 "nemotron-3.5-super-vl-free","north-mini-code-free","qwen3.6-plus-preview-free",
 "xiaomi-mimo-v2.6-flash-free","xiaomi-mimo-v2.6-pro-free","xing4.0-29b-a4b-free",
 "gemini-3-flash-preview-free","gemini-3.5-flash-lite-free","gemini-3.6-flash-free",
 "gemini-3.7-flash-free","gemini-3.8-flash-free","gpt-4.1-free","gpt-4.1-mini-free",
 "gpt-4.1-nano-free","gpt-4o-free","gpt-5.5-free","gpt-oss-20b-free","hy3-free",
 "laguna-s-2.1-free","laguna-xs-2.1-free","ling-3.0-flash-free","ling-3.0-tiny-free",
 "minimax-m2.7-free","nemotron-3-nano-30b-a3b-free","nemotron-3-super-120b-a12b-free",
 "nemotron-nano-12b-v2-vl-free","nemotron-nano-9b-v2-free","qwen3.8-flash-free",
 "qwen3.8-max-free","union-alpha-free","xiaomi-mimo-v2-omni-free","xiaomi-mimo-v2-pro-free",
 "xiaomi-mimo-v2.5-free","xiaomi-mimo-v2.5-pro-free"
];
const AIHUBMIX_FREE_CHAT_MODELS = AIHUBMIX_FREE_CHAT_IDS.map(id => ({
 id,name:id,specialty:"Chat gratuito AIHubMix · cuotas compartidas de cuenta"
}));

export const CHAT_MODELS = {
  pollinations: [
    {id:"openai/gpt-5.4-nano",name:"GPT-5.4 Nano",specialty:"Texto rápido y tareas creativas"},
    {id:"openai/gpt-oss-20b",name:"GPT-OSS 20B",specialty:"Instrucciones y escritura"},
    {id:"mistralai/mistral-small-3.2",name:"Mistral Small 3.2",specialty:"Redacción y conversación"},
    {id:"qwen/qwen3-coder-30b-a3b-instruct",name:"Qwen 3 Coder",specialty:"Programación y explicación de código"},
    {id:"google/gemma-4-26b-a4b-it",name:"Gemma 4 26B",specialty:"Tareas generales y análisis"},
    {id:"deepseek/deepseek-v4-flash",name:"DeepSeek V4 Flash",specialty:"Análisis y programación · selección opcional"}
  ],
  huggingface: [
    {id:"openai/gpt-oss-20b:cheapest",name:"GPT-OSS 20B",specialty:"Chat rápido y económico"},
    {id:"openai/gpt-oss-120b:cheapest",name:"GPT-OSS 120B",specialty:"Razonamiento avanzado"},
    {id:"Qwen/Qwen3-4B-Thinking-2507:cheapest",name:"Qwen 3 Thinking 4B",specialty:"Razonamiento ligero"},
    {id:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",name:"Qwen 2.5 Coder 32B",specialty:"Programación"},
    {id:"deepseek-ai/DeepSeek-R1:cheapest",name:"DeepSeek R1",specialty:"Investigación y razonamiento complejo"},
    {id:"google/gemma-3-27b-it:cheapest",name:"Gemma 3 27B",specialty:"Chat e instrucciones"}
  ],
  groq: [
    {id:"openai/gpt-oss-20b",name:"GPT-OSS 20B",specialty:"Chat y planificación rápida"},
    {id:"openai/gpt-oss-120b",name:"GPT-OSS 120B",specialty:"Redacción creativa y razonamiento"}
  ],
  cloudflare: [
    {id:"@cf/google/gemma-4-26b-a4b-it",name:"Gemma 4 26B",specialty:"Chat y razonamiento"},
    {id:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",name:"Llama 3.3 70B Fast",specialty:"Alternativa de chat"},
    {id:"@cf/qwen/qwen3.8-27b",name:"Qwen 3.8 27B",specialty:"Instrucciones y programación"},
    {id:"@cf/deepseek-ai/deepseek-v4.1-flash-1017",name:"DeepSeek V4.1 Flash",specialty:"Razonamiento y análisis"}
  ],
  gemini: [
    {id:"gemini-3.5-flash-lite",name:"Gemini Flash-Lite",specialty:"Respuestas breves"},
    {id:"gemini-3.8-flash",name:"Gemini Flash",specialty:"Tareas complejas"}
  ],
  openrouter: [
    {id:"openrouter/free",name:"OpenRouter Free Router",specialty:"Respaldo automático · selecciona modelos gratuitos disponibles"}
  ],
  kilo: [
    {id:"z-ai/glm-5:free",name:"GLM-5 Free",specialty:"Razonamiento y conversación · acceso anónimo"},
    {id:"minimax/minimax-m2.1:free",name:"MiniMax M2.1 Free",specialty:"Conversación y escritura · acceso anónimo"}
  ],
  requesty: [
    {id:"novita/ling-3.1-flash",name:"Ling 3.1 Flash",specialty:"Razonamiento híbrido · Novita · endpoint gratuito con ZDR"},
    {id:"ling-3.0-tiny",name:"Ling 3.0 Tiny",specialty:"Agentes y conversación · Novita · gratuito con ZDR"},
    {id:"nemotron-3.5-lightning-30b-a3b",name:"Nemotron 3.5 Lightning 30B",specialty:"Agentes y razonamiento · gratis; endpoint NVIDIA, no enviar datos confidenciales"},
    {id:"muse-glimmer-30b",name:"Muse Glimmer 30B",specialty:"Razonamiento y herramientas · gratis en NVIDIA; endpoint alternativo de pago"},
    {id:"nemotron-3.5-content-safety",name:"Nemotron 3.5 Content Safety",specialty:"Clasificación de seguridad · gratuito"},
    {id:"nemotron-3-nano-omni-30b-a3b-reasoning",name:"Nemotron 3 Nano Omni",specialty:"Razonamiento multimodal · gratuito"},
    {id:"laguna-m.1",name:"Poolside Laguna M.1",specialty:"Programación · gratuito"},
    {id:"laguna-xs.2",name:"Poolside Laguna XS.2",specialty:"Código ligero · gratuito"},
    {id:"nemotron-3-ultra-550b-a55b",name:"Nemotron 3 Ultra 550B",specialty:"Razonamiento · gratuito"},
    {id:"leanstral-1-5",name:"Mistral Leanstral 1.5",specialty:"Pruebas formales y programación · gratuito, endpoint EU"},
    {id:"gemma-4-31b-it",name:"Gemma 4 31B IT",specialty:"Chat y razonamiento · gratuito"},
    {id:"nemotron-3-super-120b-a12b",name:"Nemotron 3 Super 120B",specialty:"Razonamiento y agentes · gratuito"},
    {id:"nemotron-3-nano-30b-a3b",name:"Nemotron 3 Nano 30B",specialty:"Chat rápido · gratuito"}
  ],
  sensenova: [{id:"sensenova-6.8-flash-lite",name:"SenseNova 6.8 Flash Lite",specialty:"Razonamiento, agentes y multimodalidad · beta gratuita"}],
  zai: [
    {id:"glm-4.7-flash",name:"GLM-4.7 Flash",specialty:"Razonamiento y programación · gratuito"},
    {id:"glm-4.5-flash",name:"GLM-4.5 Flash",specialty:"Conversación rápida · gratuito"},
    {id:"glm-4.6v-flash",name:"GLM-4.6V Flash",specialty:"Modelo visual gratuito; este flujo usa solo texto"}
  ],
  baidu: [
    {id:"ernie-speed-128k",name:"ERNIE-Speed-128K",specialty:"Conversación y contexto largo · cuota gratuita regional"},
    {id:"ernie-lite-128k",name:"ERNIE-Lite-128K",specialty:"Conversación ligera · cuota gratuita regional"},
    {id:"ernie-tiny-8k",name:"ERNIE-Tiny-8K",specialty:"Respuestas rápidas · cuota gratuita regional"}
  ],
  aihubmix: AIHUBMIX_FREE_CHAT_MODELS,
  amd: [
    {id:"DeepSeek-V4-Flash",name:"DeepSeek V4 Flash",specialty:"Razonamiento · Token Factory de evaluación"},
    {id:"DeepSeek-V4.1-Flash",name:"DeepSeek V4.1 Flash",specialty:"Razonamiento · Token Factory de evaluación"},
    {id:"Qwen3.8-Flash-Next",name:"Qwen 3.8 Flash Next",specialty:"Razonamiento rápido · evaluación"},
    {id:"Qwen3.8-27B",name:"Qwen 3.8 27B",specialty:"Chat y programación · evaluación"},
    {id:"GLM-5.3-Flash",name:"GLM-5.3 Flash",specialty:"Razonamiento y código · evaluación"},
    {id:"MiMo-V2.6-Flash",name:"MiMo V2.6 Flash",specialty:"Conversación · evaluación"}
  ]
};
export const IMAGE_MODELS = {
  pollinations: [
    {id:"black-forest-labs/flux.1-schnell",name:"FLUX.1 Schnell",specialty:"Generación de imágenes"},
    {id:"tongyi-mai/z-image-turbo",name:"Z-Image Turbo",specialty:"Imágenes rápidas"}
  ],
  cloudflare: [{id:"@cf/black-forest-labs/flux-1-schnell",name:"FLUX.1 Schnell",specialty:"Generación de imágenes con Workers AI"}],
  // Higher-cost inference. Enabled only with HF_MEDIA_ENABLED=1.
  huggingface: [{id:"stabilityai/stable-diffusion-3-medium-diffusers",name:"Stable Diffusion 3 Medium",specialty:"Generación de imágenes con HF Inference"}],
  gemini: [{id:"gemini-3.1-flash-image",name:"Gemini 3.1 Flash Image",specialty:"Imagen premium, requiere activación de facturación"}]
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
