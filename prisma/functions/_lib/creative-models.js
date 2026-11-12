// Server-side capability classification for creative model catalogues.
// Keep the complete verified free-model set: specialized models belong in
// "Crear", not in a general chat fallback.
export function creativeKind(model = {}) {
 const id=String(model.id||"").toLowerCase(),name=String(model.name||"").toLowerCase();
 const text=id+" "+name;
 const output=(model?.architecture?.output_modalities||model?.output_modalities||[]).map?.(x=>String(x).toLowerCase())||[];
 if(/lyria|musicgen|music-gen|riffusion|music.generation|ace.step|suno|udio/.test(text))return "music";
 if(/whisper|transcrib|speech.to.text|audio.to.text/.test(text))return "transcription";
 if(/moderation|content.safety|safety.classifier|guardrail|classifier/.test(text))return "safety";
 if(/embedding|rerank|vector/.test(text))return "embedding";
 if(/\bvideo\b|veo-|wan\d|kling|sora/.test(text)||output.includes("video"))return "video";
 if(/image|imagen|flux[./-]|diffusion|dall.e|recraft|ideogram|z.image/.test(text)||output.includes("image")&&!output.includes("text"))return "image";
 if(/speech|voice|\btts\b|\baudio\b/.test(text)||output.includes("audio")&&!output.includes("text"))return "audio";
 return "";
}
export const GEMINI_MUSIC_MODELS=Object.freeze([
 {id:"lyria-3.5",name:"Lyria 3.5",kind:"music",specialty:"Canciones completas con voz e instrumentación · de pago"},
 {id:"lyria-3-clip-preview",name:"Lyria 3 Clip",kind:"music",specialty:"Clips musicales de 30 segundos · de pago"},
 {id:"lyria-3-pro-preview",name:"Lyria 3 Pro",kind:"music",specialty:"Canciones completas · versión anterior · de pago"},
 {id:"lyria-realtime-exp",name:"Lyria RealTime",kind:"music",specialty:"Música en directo · requiere integración de streaming"}
]);
