// Curated, server-controlled model allowlists. Never trust client supplied model IDs.
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
    {id:"nemotron-3.5-lightning-30b-a3b",name:"Nemotron 3.5 Lightning 30B",specialty:"Agentes, razonamiento y código · gratuito"},
    {id:"muse-glimmer-30b",name:"Muse Glimmer 30B",specialty:"Razonamiento y tareas agentic · gratuito"},
    {id:"novita/ling-3.1-flash",name:"Ling 3.1 Flash",specialty:"Razonamiento híbrido · endpoint gratuito Novita"}
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
  aihubmix: [
    {id:"coding-glm-5.3-free",name:"Coding GLM-5.3 Free",specialty:"Programación · 10 llamadas de prueba totales"},
    {id:"coding-glm-5.3-flash-free",name:"Coding GLM-5.3 Flash Free",specialty:"Programación rápida · 10 llamadas de prueba totales"},
    {id:"coding-kimi-k3-free",name:"Coding Kimi K3 Free",specialty:"Programación y razonamiento · 10 llamadas de prueba totales"},
    {id:"xiaomi-mimo-v2.6-pro-free",name:"Xiaomi MiMo V2.6 Pro Free",specialty:"Razonamiento · 10 llamadas de prueba totales"},
    {id:"coding-minimax-m3-free",name:"Coding MiniMax M3 Free",specialty:"Programación · 10 llamadas de prueba totales"}
  ],
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
