// Shared semantics for the model picker. Text-only Core must never advertise
// music, video, moderation or transcription endpoints as conversational LLMs.
const PREFERRED_MODELS = Object.freeze({
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-3.5-flash-lite',
  zai: 'glm-4.7-flash',
  sensenova: 'sensenova-6.8-flash-lite',
  cloudflare: '@cf/google/gemma-4-26b-a4b-it',
  pollinations: 'openai/gpt-5.4-nano',
  requesty: 'nvidia/nemotron-3-nano-30b-a3b',
  openrouter: 'openrouter/free',
  kilo: 'z-ai/glm-5:free',
  huggingface: 'openai/gpt-oss-20b:cheapest'
});

export function describeCoreModel(model = {}) {
  const name = String(model?.name || model?.id || '');
  const id = String(model?.id || '');
  const specialty = String(model?.specialty || '');
  const label = (id + ' ' + name).toLocaleLowerCase('en');
  const detail = specialty.toLocaleLowerCase('es');
  const output = (Array.isArray(model?.output_modalities) ? model.output_modalities : []).map(String);
  if (/lyria|musicgen|music-gen|music_generation|stable.audio|riffusion|ace.step|suno|udio/.test(label) ||
      /generaci[oó]n (?:de )?m[uú]sica|music generation/.test(detail)) {
    return {kind:'music',label:'Música',description:'Generación musical; devuelve audio, no respuestas de chat.'};
  }
  if (/whisper|transcrib|speech.to.text|audio.to.text/.test(label) || /transcripci[oó]n/.test(detail)) {
    return {kind:'transcription',label:'Transcripción',description:'Convierte voz o audio en texto.'};
  }
  if (/content.safety|content.moderation|moderation|guardrail|classif.*safety/.test(label) ||
      /clasificaci[oó]n de seguridad/.test(detail)) {
    return {kind:'safety',label:'Moderación',description:'Clasifica contenido; no mantiene conversaciones.'};
  }
  if (/embed|rerank|vectorization/.test(label)) {
    return {kind:'embedding',label:'Búsqueda',description:'Representaciones vectoriales; no es un chat.'};
  }
  if (/video|veo-|wan[0-9]|sora|kling/.test(label) || output.includes('video')) {
    return {kind:'video',label:'Vídeo',description:'Generación de vídeo, no chat.'};
  }
  if (/image|imagen|flux\b|diffusion|dall.e|recraft|ideogram|z.image/.test(label) ||
      output.includes('image') && !output.includes('text')) {
    return {kind:'image',label:'Imágenes',description:'Crea imágenes; utiliza un flujo visual.'};
  }
  if (/speech|voice|text.to.speech|\btts\b/.test(label) ||
      output.includes('audio') && !output.includes('text')) {
    return {kind:'audio',label:'Audio',description:'Generación de voz o audio; no es un chat.'};
  }
  if (/coder|coding|code|poolside|leanstral/.test(label) || /programaci[oó]n|c[oó]digo/.test(detail)) {
    return {kind:'code',label:'Programación',description:'Ayuda a escribir, revisar y explicar código.'};
  }
  if (/reason|thinking|deepseek.r1/.test(label) || /razonamiento|investigaci[oó]n/.test(detail)) {
    return {kind:'reasoning',label:'Razonamiento',description:'Análisis y resolución de problemas.'};
  }
  if (/vision|visual|omni/.test(label) || /modelo visual/.test(detail)) {
    return {kind:'vision',label:'Texto y visión',description:'Modelo multimodal; las imágenes requieren un flujo compatible.'};
  }
  return {kind:'chat',label:'Conversación',description:'Preguntas, escritura e instrucciones generales.'};
}

export function isCoreChatModel(model) {
  return ['chat','code','reasoning','vision'].includes(describeCoreModel(model).kind);
}

export function suggestedCoreModel(provider, models = []) {
  const compatible = Array.isArray(models) ? models.filter(isCoreChatModel) : [];
  return compatible.find(model => model.id === PREFERRED_MODELS[provider]) || compatible[0] || null;
}

export function displayedConversationPreference(selection = {}) {
  const isManual = selection.mode === 'manual' && selection.requestedProvider && selection.requestedModel;
  return {
    provider: isManual ? selection.requestedProvider : (selection.provider || ''),
    model: isManual ? selection.requestedModel : (selection.model || ''),
    fallbackActive: Boolean(isManual && selection.source === 'fallback' &&
      (selection.provider !== selection.requestedProvider || selection.model !== selection.requestedModel))
  };
}

/**
 * Visible explanation beneath every model. Prefer an explicit catalog purpose;
 * never guess a model's capability from a marketing name alone.
 */
export function coreModelPurpose(model = {}) {
 const kind = model.kind || describeCoreModel(model).kind;
 const named = describeCoreModel(model);
 const descriptions = {
  chat:'Conversación y redacción: responde preguntas y ayuda con tareas de texto.',
  reasoning:'Razonamiento: analiza problemas y explica soluciones paso a paso.',
  code:'Programación: escribe, revisa y explica código.',
  vision:'Texto e imágenes: analiza contenido visual cuando el proveedor lo permite.',
  music:'Música: genera o procesa composiciones musicales; requiere un flujo de audio compatible.',
  image:'Imágenes: crea contenido visual a partir de una descripción.',
  video:'Vídeo: genera o procesa secuencias visuales; requiere un flujo de vídeo.',
  audio:'Voz y audio: genera o transforma sonido.',
  transcription:'Transcripción: convierte voz o grabaciones en texto.',
  safety:'Moderación: clasifica contenido y detecta riesgos; no conversa.',
  embedding:'Vectores: convierte contenido en representaciones para búsqueda.',
  other:'Herramienta especializada: revisa sus capacidades antes de utilizarla.'
 };
 const specific = String(model.description || model.purpose || '').trim();
 if(specific) return specific;
 return descriptions[kind] || named.description || descriptions.other;
}
