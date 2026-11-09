// Shared, deterministic image policy for Prisma Core.
// Route only to server-enabled image backends, never spend personal BYOK
// credentials or activate premium image providers without explicit server opt-in.
const DEFAULTS = Object.freeze({
  cloudflare: '@cf/black-forest-labs/flux-1-schnell',
  pollinations: 'black-forest-labs/flux.1-schnell',
  huggingface: 'stabilityai/stable-diffusion-3-medium-diffusers',
  gemini: 'gemini-3.1-flash-image',
});

export function selectImageCandidates({ provider='auto', features={}, model='' }={}) {
  const enabled = {
    cloudflare: features.cloudflareImages === true,
    pollinations: features.pollinationsImages === true,
    huggingface: features.huggingfaceImages === true,
    gemini: features.geminiImages === true,
  };
  const order = provider === 'auto'
    ? ['cloudflare','pollinations','huggingface','gemini']
    : [provider];
  return order.filter(name => enabled[name] && DEFAULTS[name]).map(name => ({
    provider:name,
    model:provider === 'auto' ? DEFAULTS[name] : model || DEFAULTS[name],
  }));
}

export function imageFailureDecision({ status=0, code='' }={}) {
  const http = Number(status) || 0;
  if(code === 'GLOBAL_LIMIT' || code === 'LIMITS_UNAVAILABLE')
    return { stop:true, blockProvider:true };
  // A malformed prompt or request will not improve by trying more providers.
  if([400,413,415,422].includes(http))
    return { stop:true, blockProvider:true };
  // Do not cycle other keys or models under the same provider's exhausted quota.
  if(code === 'PROVIDER_LIMIT' || code === 'PROVIDER_MINUTE_LIMIT' ||
    [401,402,403,429].includes(http))
    return { stop:false, blockProvider:true };
  return { stop:false, blockProvider:false };
}
