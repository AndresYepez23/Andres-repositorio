// Preserve relevant conversation context without sending every saved message
// to AI providers. Only messages from the active chat are supplied by Core.
const fold = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const STOP = new Set([
  'para','como','cual','cuales','quiero','necesito','puedes','hazme','hacer','hazlo',
  'esta','este','estos','estas','algo','unos','unas','las','los','del','por','con',
  'una','uno','que','pero','tambien','sobre','mas','menos','esa','eso','aqui',
  'ahi','mismo','misma','igual','otro','otra','ahora','dame','donde','cuando',
  'continua','sigue','ponlo','mejoralo','cambialo','ajustalo'
]);
function keywords(value) {
  return [...new Set((fold(value).match(/[\p{L}\p{N}]{3,}/gu) || [])
    .filter(word => !STOP.has(word)))];
}

/**
 * Build bounded, chronological context from the current conversation.
 * - The most recent turns always take precedence.
 * - Older turns return only when relevant to the current question.
 * - Neither files nor conversations from another thread are read here.
 */
export function buildConversationContext(history = [], query = '', options = {}) {
  const limit = Math.max(4, Math.min(16, Number(options.maxMessages) || 13));
  const budget = Math.max(2800, Math.min(22000, Number(options.maxChars) || 14000));
  const entries = (Array.isArray(history) ? history : [])
    .filter(item => item && ['user', 'assistant'].includes(item.role) &&
      typeof item.content === 'string' && item.content.trim())
    .map(item => ({ role: item.role, content: item.content.trim() }));
  if (!entries.length) return [];

  const recentCount = Math.min(entries.length, 9);
  const recentStart = entries.length - recentCount;
  const selected = new Set(entries.map((_, index) => index).slice(recentStart));
  const words = keywords(query);
  const vague = words.length <= 1 || /^(?:y|pero|entonces|ahora|eso|esta|este|ahi|aqui)\b/.test(fold(query).trim());

  if (recentStart && !vague) {
    const ranked = entries.slice(0, recentStart).map((entry, index) => {
      const past = fold(entry.content.slice(0, 3500));
      const overlap = words.filter(word => past.includes(word)).length;
      const score = overlap * 3 + (entry.role === 'user' && overlap ? 1 : 0) +
        (overlap >= 2 ? 2 : 0);
      return { index, score };
    }).filter(item => item.score >= 4).sort((a, b) =>
      b.score - a.score || b.index - a.index);
    for (const entry of ranked.slice(0, Math.max(0, limit - recentCount))) {
      selected.add(entry.index);
    }
  }

  // Enforce the total character budget beginning with the latest exchanges.
  // Older relevant material is included only if it fits after recent context.
  const chosen = [...selected].sort((a, b) => b - a);
  const result = [];
  let remaining = budget;
  for (const index of chosen) {
    if (result.length >= limit || remaining < 120) break;
    const recent = index >= recentStart;
    const cap = recent ? 1900 : 1200;
    const content = entries[index].content.slice(0, Math.min(cap, remaining));
    if (content) {
      result.push({ index, role: entries[index].role, content });
      remaining -= content.length;
    }
  }
  return result.sort((a, b) => a.index - b.index)
    .map(({ role, content }) => ({ role, content }));
}

export function chooseCoreReasoning(task = 'conversation', text = '') {
  const q = fold(text).replace(/^[¿?¡!\s]+/,'').trim();
  const deep = /\b(depura|debug|refactoriza|implementa|reescribe|arquitectura|analiza|investiga|demuestra|demostrar|resuelve|evalua|razonamiento|argumenta|exhaustivo|profundo|a fondo|detalladamente|paso a paso)\b/.test(q);
  if (task === 'coding') {
    if(q.length < 180 && /^(?:que es|para que sirve|cual es|explica brevemente|dame un ejemplo)\b/.test(q) && !deep) return 'balanced';
    return 'smart';
  }
  if (task === 'reasoning') return q.length < 130 && !deep ? 'balanced' : 'smart';
  if (task === 'songwriting' || task === 'creative') return 'balanced';
  if ((task === 'conversation' || task === 'general') && q.length <= 160 && !deep) return 'fast';
  return 'balanced';
}

// Limit unneeded output tokens without making substantive requests artificially
// short. A concise answer should not reserve the same tokens as a full report.
export function chooseCoreResponseLength(task = 'conversation', text = '') {
  const q = fold(text).replace(/^[¿?¡!\s]+/,'').trim();
  const detailed = /\b(?:detallad\w*|complet\w*|extens\w*|profund\w*|a fondo|paso a paso|informe|ensayo|tutorial|guia completa|proyecto completo|archivo completo)\b/.test(q);
  const brief = /\b(?:breve(?:mente)?|cort[oa]|resumid[oa]|en una frase|rapido|simple|sin explicaciones)\b/.test(q);
  if(task === 'songwriting') return 'long';
  if(detailed) return 'long';
  if(brief) return 'short';
  if(task === 'coding') return q.length < 150 && /^(?:que es|para que sirve|explica|dame un ejemplo)\b/.test(q) ? 'medium' : 'long';
  if(task === 'reasoning') return q.length < 130 ? 'medium' : 'long';
  if(task === 'conversation' || task === 'quick' || task === 'general') return q.length < 160 ? 'short' : 'medium';
  return 'medium';
}
