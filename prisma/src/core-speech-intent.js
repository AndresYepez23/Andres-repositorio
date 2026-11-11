// Deterministic text-to-speech intent and payload extraction.
// Supports the conversion command before or after the text being spoken.
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();

export function speechIntent(message) {
  const q = fold(message);
  if (/(?:audio|voz)\s+a\s+texto|transcrib|subtitul/.test(q)) return false;
  if (/(?:cancion|musica|melodia|instrumental|banda sonora)/.test(q) &&
      !/(?:letra|texto).*\b(?:voz|narrac|habla)/.test(q)) return false;
  if (/^(?:que es|como funciona|para que sirve|cuanto cuesta|es posible|puedes explicar)\b/.test(q)) return false;
  if (/^(?:por que|no me|me falla|error|fallo|problema)\b/.test(q)) return false;
  const narration = /(?:leeme|\blee\b|lectura en voz alta|\bnarra\b|narrame|ponle voz|hablalo|dilo en voz alta|escuchar.*(?:texto|respuesta|mensaje))/.test(q);
  const generation = /(?:pas|conviert|convert|transform|gener|cre|haz|grab|produc|quier|necesit|guard).{0,85}(?:audio|mp3|voz|narracion|hablado)/.test(q);
  const reverse = /(?:texto|archivo|documento|respuesta|mensaje|frase).{0,65}(?:a\s+audio|a\s+voz|en\s+audio|en\s+mp3)/.test(q);
  return narration || generation || reverse || /(?:texto\s+a\s+(?:voz|audio)|text\s*to\s*speech|\btts\b)/.test(q);
}

export function inlineSpeechText(command) {
  const full = String(command || '').trim();
  if (!full) return '';

  // "Texto, conviértelo a audio" / "Texto convierte a audio".
  const trailing = full.match(/^([\s\S]*?)\s*,?\s*(?:por favor\s+)?(?:convierte|convertir|convi[eé]rtelo|convi[eé]rtela|pasa|pasar|p[aá]salo|p[aá]sala|transforma|transformar|transf[oó]rmalo|genera|generar|gen[eé]rame|graba|grabar|narra|narrar|l[eé]eme|lee|l[eé]elo|ponlo|ponle)\s+(?:(?:este|el|lo|la|esto|eso|texto|mensaje|frase)\s+)?(?:a|en)\s+(?:audio|voz|mp3)\s*[.!?]*$/i);
  const source = trailing && trailing[1].trim().length >= 2
    ? trailing[1].trim().replace(/[,\s;:—-]+$/,'')
    : full;

  const quoted = source.match(/[«“"]([^«”"]{2,1600})[»”"]/);
  if (quoted) return quoted[1].trim();

  const separator = source.match(/(?:texto|frase|mensaje|contenido|que diga|lo siguiente)\s*[:：]\s*([\s\S]{2,})$/i);
  if (separator) return separator[1].trim();
  if (trailing && source.length >= 2) return source;

  // "Convierte a audio: texto" and "Convierte a audio texto".
  const natural = source.match(/^(?:convierte|convertir|pasa|pasame|pásame|hazme|genera|graba|narra|léeme|leeme)\s+(?:(?:este|el|mi|un)\s+)?(?:(?:texto|mensaje|frase)\s+)?(?:a|en)\s+(?:audio|voz|mp3)\s*[,;:\-]?\s+([\s\S]{2,})$/i);
  if (natural && !/^(?:este texto|el texto|el archivo|un documento|mi documento|el documento)\s*$/i.test(natural[1].trim()))
    return natural[1].trim();

  // "Convierte [texto] a audio".
  const leading = source.match(/^(?:convierte|convertir|pasa|pasar|transforma|transformar|genera|generar|graba|grabar|narra|narrar)\s+([\s\S]{2,}?)\s+(?:a|en)\s+(?:audio|voz|mp3)\s*[.!?]*$/i);
  if (leading && leading[1].trim().length >= 2) return leading[1].trim();

  const casual = source.match(/^(?:hazme|genera(?:me)?|crea(?:me)?|graba(?:me)?|quiero|necesito|dame|prepara(?:me)?|pon|dilo|di|narra|leeme|léeme)\s+(?:un\s+)?(?:audio|mp3|voz|locucion|locución)?\s*(?:que\s+(?:diga|suene|lea)|con\s+(?:la\s+)?frase|de\s+)?\s*[:,-]?\s*([\s\S]{3,})$/i);
  if (casual && casual[1] && !/^(?:este|el|mi)\s+(?:texto|archivo|documento|pdf|word)\s*$/i.test(casual[1].trim()))
    return casual[1].trim();

  const spoken = source.match(/(?:que\s+diga|para\s+decir)\s*[:,-]?\s*([\s\S]{3,})$/i);
  if (spoken) return spoken[1].trim();

  const colon = source.match(/[:：]\s*([^\n]{2,}(?:\n[\s\S]*)?)$/);
  if (colon) return colon[1].trim();

  const newlines = source.split(/\n+/).slice(1).join('\n').trim();
  if (newlines.length > 2) return newlines;
  return '';
}
