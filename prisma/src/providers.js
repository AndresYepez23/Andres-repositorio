export const providers = [
  { id:'gemini', name:'Google Gemini', kind:'Modelos multimodales', capabilities:['Texto','Imágenes','Análisis'], stage:'Evaluación', note:'Nivel gratuito sujeto a límites y condiciones de datos.' },
  { id:'groq', name:'Groq', kind:'Inferencia de baja latencia', capabilities:['Texto','Transcripción'], stage:'Evaluación', note:'Cuotas por organización; el consumo de visitantes se comparte.' },
  { id:'cloudflare', name:'Cloudflare Workers AI', kind:'Modelos desplegados en edge', capabilities:['Texto','Imagen','Audio'], stage:'Evaluación', note:'Cuota gratuita diaria; el exceso puede generar costes.' },
  { id:'huggingface', name:'Hugging Face', kind:'Catálogo de modelos', capabilities:['Modelos open source','Embeddings'], stage:'Exploración', note:'No usaremos ZeroGPU compartido como motor principal.' },
  { id:'local', name:'Modelos propios', kind:'Open source y autoalojados', capabilities:['Whisper','Kokoro','ONNX'], stage:'Exploración', note:'La viabilidad depende de la infraestructura y la licencia de cada modelo.' }
];
