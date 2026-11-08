export const providers = [
  { id:'huggingface', name:'Hugging Face Inference', kind:'Modelos de generación e inferencia', capabilities:['Texto a imagen','Audio a texto','Modelos open source'], stage:'BYOK disponible', note:'El usuario conecta su propio token con permiso Inference Providers. PRISMA no lo almacena.' },
  { id:'pollinations', name:'Pollinations', kind:'Generación multimodal', capabilities:['Imagen','Audio','Vídeo','Texto'], stage:'Integración futura', note:'La conexión para aplicaciones web usa autorización BYOP; requiere registrar una app y consentimiento del usuario.' },
  { id:'cloudflare', name:'Cloudflare Workers AI', kind:'Inferencia en edge', capabilities:['Imagen','Texto','Audio'], stage:'Backend futuro', note:'Necesita una función de servidor para mantener las credenciales fuera del navegador y controlar cuotas.' },
  { id:'groq', name:'Groq', kind:'Inferencia de baja latencia', capabilities:['Texto','Transcripción'], stage:'Evaluación', note:'Podría aportar transcripción y modelos de lenguaje rápidos mediante backend seguro.' },
  { id:'local', name:'Modelos en navegador', kind:'Procesamiento local y open source', capabilities:['OCR','Eliminación de fondo','ONNX'], stage:'Disponible', note:'Las tareas compatibles se ejecutan en el dispositivo; el rendimiento depende del equipo.' }
];
