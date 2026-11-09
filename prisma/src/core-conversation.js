const fold = value => String(value || '')
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[¿?¡!.,;:…]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const ACKNOWLEDGEMENT_PATTERNS = [
  /^(?:que )?(?:muy )?(?:buena|buenisima|excelente|genial|brutal|hermosa|bonita|increible|perfecta|estupenda|fantastica)(?: (?:cancion|letra|respuesta|idea|trabajo|version|resultado))?$/,
  /^(?:esta|esa|quedo|salio) (?:muy )?(?:buena|buenisima|excelente|genial|brutal|hermosa|bonita|increible|perfecta)(?: (?:cancion|letra|respuesta|idea|version))?$/,
  /^(?:me gusta|me gusto|me encanta|me encanto|me fascina|me fascino)(?: mucho| bastante)?(?: (?:la|esta|esa) (?:cancion|letra|respuesta|idea|version))?$/,
  /^(?:gracias|muchas gracias|mil gracias|te agradezco|buen trabajo|excelente trabajo|muy bien|bien hecho|asi esta bien|asi me gusta|me parece bien|quedo perfecto|quedo excelente|perfecto|genial|brutal|increible|excelente)$/
];

export function isAcknowledgementMessage(value) {
  const text = fold(value);
  if (!text || text.length > 100) return false;
  // A compliment that also asks for a new action is a real instruction.
  if (/\b(?:haz|crea|genera|escribe|compone|compon|dame|prepara|cambia|modifica|agrega|quita|continua|sigue|inventa|produce|otra|nuevo|nueva)\b/.test(text)) return false;
  return ACKNOWLEDGEMENT_PATTERNS.some(pattern => pattern.test(text));
}

export function buildAcknowledgementReply(value, previousAssistant = '') {
  const text = fold(value);
  if (/^(?:gracias|muchas gracias|mil gracias|te agradezco)$/.test(text)) {
    return '¡Con gusto! Seguimos cuando quieras.';
  }
  const context = fold(previousAssistant);
  const songContext = /\b(?:cancion|letra|verso|coro|alabanza|balada|musica|musical)\b/.test(context);
  if (songContext) {
    return '¡Me alegra que te haya gustado la canción! Seguimos trabajando sobre esta misma; no generaré otra a menos que me la pidas.';
  }
  return '¡Me alegra que te haya servido! Seguimos sobre esta misma conversación cuando quieras.';
}
