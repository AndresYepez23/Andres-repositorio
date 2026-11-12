const credentialKeys = {
  huggingface: 'prisma-huggingface-token',
  gemini: 'prisma-gemini-api-key',
  groq: 'prisma-groq-api-key'
};

async function readError(response, provider) {
  let message = '';
  try {
    const data = await response.json();
    message = data.error?.message || data.error_description || data.message || '';
  } catch {}
  if (response.status === 401 || response.status === 403) {
    if (provider === 'huggingface') return 'El token no es válido o no tiene permiso para usar Inference Providers.';
    if (provider === 'gemini') return 'Google no aceptó la clave. Comprueba que la API de Gemini esté habilitada para ese proyecto.';
    if (provider === 'groq') return 'Groq no reconoció la clave o esta no tiene acceso a la API.';
  }
  if (response.status === 429) return 'El proveedor alcanzó un límite temporal. Inténtalo más tarde o utiliza otro motor conectado.';
  return message || 'El proveedor respondió con el código ' + response.status + '.';
}

export function getProviderCredential(provider) {
  const key = credentialKeys[provider];
  return key ? sessionStorage.getItem(key) || '' : '';
}

export function saveProviderCredential(provider, credential) {
  const key = credentialKeys[provider];
  if (!key) throw new Error('Este proveedor no utiliza una clave personal.');
  sessionStorage.setItem(key, String(credential || '').trim());
}

export function removeProviderCredential(provider) {
  const key = credentialKeys[provider];
  if (key) sessionStorage.removeItem(key);
}

export function isProviderConnected(provider) {
  return !!getProviderCredential(provider);
}

export async function validateProviderCredential(provider, credential) {
  const token = String(credential || '').trim();
  if (!token) throw new Error('Pega primero tu clave de conexión.');

  let url = '';
  let headers = {};
  if (provider === 'huggingface') {
    if (!token.startsWith('hf_')) throw new Error('El token de Hugging Face debe comenzar por hf_.');
    url = 'https://huggingface.co/api/whoami-v2';
    headers = { Authorization: 'Bearer ' + token };
  } else if (provider === 'groq') {
    if (!token.startsWith('gsk_')) throw new Error('La clave de Groq debe comenzar por gsk_.');
    url = 'https://api.groq.com/openai/v1/models';
    headers = { Authorization: 'Bearer ' + token };
  } else if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
    headers = { 'x-goog-api-key': token };
  } else {
    throw new Error('Proveedor de conexión no compatible.');
  }

  let response;
  try {
    response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
  } catch {
    throw new Error('No fue posible contactar al proveedor. Comprueba tu conexión e inténtalo de nuevo.');
  }
  if (!response.ok) throw new Error(await readError(response, provider));

  let data = {};
  try { data = await response.json(); } catch {}
  let accountLabel = '';
  if (provider === 'huggingface') accountLabel = data.name || data.user || '';
  if (provider === 'groq') accountLabel = (data.data || []).length + ' modelos disponibles';
  if (provider === 'gemini') accountLabel = (data.models || []).length + ' modelos consultados';
  return { ok: true, provider, accountLabel };
}
let cachedCentralStatus = null;
let centralStatusExpiresAt = 0;
let centralStatusPending = null;

// Avoid blocking every message on repeated provider-catalogue network calls.
// Cache holds only public status metadata, never API credentials or prompts.
export async function getCentralProviderStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedCentralStatus && now < centralStatusExpiresAt) return cachedCentralStatus;
  if (centralStatusPending) return centralStatusPending;

  const empty = {
    ok: false,
    mode: "central",
    providers: { gemini: false, huggingface: false, groq: false, cloudflare: false, pollinations: false, openrouter: false, kilo:false, requesty:false, sensenova:false, zai:false, aihubmix:false },
    models: {},
    modelCatalog: {chat:{},image:{},audio:{}},
    usage: {},
    warnings: {},
    configured: {},
    credentialSlots: {},
    features: {pollinationsImages:false,cloudflareImages:false,huggingfaceImages:false,huggingfaceAudio:false,groqAudio:false,cloudflareAudio:false,openrouterChat:false}
  };
  const work = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch("/api/providers/status", {
        method: "GET", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw Error("No fue posible consultar proveedores.");
      const data = await response.json();
      if (data.ok !== true) throw Error("La consulta no fue válida.");
      const ready = {
        ...empty, ...data, ok:true,
        providers: { ...empty.providers, ...(data.providers || {}) },
        models: data.models || {},
        modelCatalog: data.modelCatalog || empty.modelCatalog,
        warnings: data.warnings || {},
        configured: data.configured || {},
        credentialSlots: data.credentialSlots || {},
        features: { ...empty.features, ...(data.features || {}) }
      };
      cachedCentralStatus = ready;
      centralStatusExpiresAt = Date.now() + 30000;
      return ready;
    } catch {
      // Short, bounded stale cache keeps existing sessions functional during a
      // transient status outage; inference endpoints still validate every request.
      return cachedCentralStatus && Date.now() < centralStatusExpiresAt + 60000
        ? cachedCentralStatus : empty;
    } finally { clearTimeout(timeout); }
  })();

  centralStatusPending = work;
  try { return await work; }
  finally { if (centralStatusPending === work) centralStatusPending = null; }
}
