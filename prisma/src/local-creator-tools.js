// Small, useful browser-first tools. No external API calls or uploaded files.
export const LOCAL_CREATOR_TOOL_IDS = Object.freeze([
  'text-redact-sensitive', 'utm-builder', 'subtitle-srt-local'
]);

function redactSensitiveText(source) {
  if (!source.trim()) throw Error('Pega el texto que quieres revisar.');
  if (source.length > 150000) throw Error('El texto supera el límite local de 150.000 caracteres.');
  let secrets = 0, emails = 0, phones = 0;
  let result = source.replace(
    /\b(?:rqsty-sk-|gsk_|AIza|sk-|hf_|xoxb-)[A-Za-z0-9+/_=-]{12,}(?![A-Za-z0-9+/_=-])/g,
    () => { secrets++; return '[CLAVE OCULTA]'; }
  );
  result = result.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    () => { emails++; return '[CORREO OCULTO]'; }
  );
  // Telephone-like strings only; do not hide ordinary 4-digit years.
  result = result.replace(/(?:^|[^\w])(\+?\d[\d .()-]{7,}\d)(?!\w)/gm, (match, candidate) => {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) return match;
    phones++;
    return match.replace(candidate, '[TELÉFONO OCULTO]');
  });
  const total = secrets + emails + phones;
  return { text: result, summary: total + ' coincidencia(s) potencialmente sensibles ocultadas: ' +
    secrets + ' claves, ' + emails + ' correos, ' + phones + ' teléfonos. ' +
    'Revisa manualmente antes de publicar: este detector no garantiza anonimización completa.' };
}

function makeCampaignUrl(params) {
  const source = String(params.url || '').trim();
  if (!source) throw Error('Pega la URL de destino.');
  let url;
  try { url = new URL(source); } catch { throw Error('Usa una URL completa, por ejemplo https://ejemplo.com.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error('Solo se admiten URL HTTP o HTTPS sin credenciales.');
  const required = {
    utm_source: String(params.source || '').trim(),
    utm_medium: String(params.medium || '').trim(),
    utm_campaign: String(params.campaign || '').trim()
  };
  if (Object.values(required).some(value => !value))
    throw Error('Completa origen, medio y campaña para generar el enlace.');
  const optional = {
    utm_content: String(params.content || '').trim(),
    utm_term: String(params.term || '').trim()
  };
  for (const [key, value] of Object.entries({...required, ...optional})) {
    if (value) url.searchParams.set(key, value);
    else if (key in optional) url.searchParams.delete(key);
  }
  return { text: url.toString(), summary: 'URL de campaña UTM creada localmente. Conserva los demás parámetros existentes.' };
}

function makeSubtitles(params) {
  const source = String(params.text || '').trim();
  if (!source) throw Error('Pega el guion o las frases que quieres convertir en subtítulos.');
  if (source.length > 40000) throw Error('El guion supera los 40.000 caracteres.');
  const seconds = Number(params.secondsPerCue ?? 4);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 12)
    throw Error('La duración estimada por subtítulo debe estar entre 1 y 12 segundos.');
  const maxLength = Math.max(35, Math.min(110, Number(params.charactersPerCue) || 72));
  const captions = [];
  for (const paragraph of source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    const words = paragraph.split(/\s+/);
    let chunk = '';
    for (const word of words) {
      if (chunk && (chunk.length + 1 + word.length > maxLength)) {
        captions.push(chunk);
        chunk = word;
      } else {
        chunk += (chunk ? ' ' : '') + word;
      }
    }
    if (chunk) captions.push(chunk);
    if (captions.length > 300) throw Error('El guion produce demasiados subtítulos (máximo 300).');
  }
  const stamp = milliseconds => {
    const value = Math.max(0, Math.round(milliseconds));
    const pad = (number, size = 2) => String(number).padStart(size, '0');
    const h = Math.floor(value / 3600000);
    const m = Math.floor(value / 60000) % 60;
    const s = Math.floor(value / 1000) % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s) + ',' + pad(value % 1000, 3);
  };
  const interval = Math.round(seconds * 1000);
  const result = captions.map((caption, index) =>
    (index + 1) + '\n' + stamp(index * interval) + ' --> ' +
    stamp((index + 1) * interval) + '\n' + caption
  ).join('\n\n');
  return {
    text: result,
    blob: new Blob([result + '\n'], { type: 'text/plain;charset=utf-8' }),
    filename: 'prisma-subtitulos.srt',
    summary: captions.length + ' subtítulos SRT con tiempos estimados. ' +
      'No están sincronizados con audio real; ajusta sus tiempos en tu editor.'
  };
}

export function runLocalCreatorTool(id, params = {}) {
  if (id === 'text-redact-sensitive') return redactSensitiveText(String(params.text || ''));
  if (id === 'utm-builder') return makeCampaignUrl(params);
  if (id === 'subtitle-srt-local') return makeSubtitles(params);
  throw Error('Herramienta local no reconocida.');
}
