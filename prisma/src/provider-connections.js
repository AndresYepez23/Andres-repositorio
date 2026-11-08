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
export async function getCentralProviderStatus() {
  const empty = {
    ok: false,
    mode: "central",
    providers: { gemini: false, huggingface: false, groq: false, cloudflare: false },
    models: {},
    modelCatalog: {chat:{},image:{},audio:{}},
    features: {cloudflareImages:false,huggingfaceImages:false,groqAudio:false},
  };
  try {
    const response = await fetch("/api/providers/status", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return empty;
    const data = await response.json();
    return {
      ...empty,
      ...data,
      ok: data.ok === true,
      providers: { ...empty.providers, ...(data.providers || {}) },
      models: data.models || {},
      modelCatalog: data.modelCatalog || empty.modelCatalog,
      features: { ...empty.features, ...(data.features || {}) },
    };
  } catch {
    return empty;
  }
}
