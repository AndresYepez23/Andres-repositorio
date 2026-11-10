// Shared, loss-resistant conversation normalization and merge helpers.
const OMIT_KEYS = new Set(['blob', 'previewUrl', 'objectUrl', 'fileObject', 'rawFile']);

function jsonSafe(value, key = '') {
  if (OMIT_KEYS.has(key)) return undefined;
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
  if (typeof File !== 'undefined' && value instanceof File) return undefined;
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return undefined;
  if (Array.isArray(value)) return value.map(item => jsonSafe(item)).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const safe = jsonSafe(childValue, childKey);
      if (safe !== undefined) output[childKey] = safe;
    }
    return output;
  }
  return value;
}

function stableLegacyMessageId(chatId, message, index) {
  const source = [chatId, index, message?.role || '', message?.time || '', message?.content || ''].join('|');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'legacy-' + (hash >>> 0).toString(36);
}

export function normalizeConversation(input) {
  const raw = jsonSafe(input && typeof input === 'object' ? input : {}) || {};
  const id = String(raw.id || raw.chat_id || '').trim().slice(0, 120);
  if (!id) return null;
  const sourceMessages = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = sourceMessages.map((entry, index) => {
    const safe = jsonSafe(entry && typeof entry === 'object' ? entry : {}) || {};
    return {
      ...safe,
      id: String(safe.id || stableLegacyMessageId(id, safe, index)).slice(0, 160),
      role: String(safe.role || 'assistant').slice(0, 30),
      content: String(safe.content ?? ''),
      time: Number(safe.time) || 0
    };
  });
  const updatedFromIso = Date.parse(raw.updated_at || '') || 0;
  const createdFromIso = Date.parse(raw.created_at || '') || 0;
  return {
    ...raw,
    id,
    title: String(raw.title || 'Nueva conversación').slice(0, 140),
    titled: !!raw.titled,
    pinned: !!raw.pinned,
    created: Number(raw.created) || createdFromIso || Date.now(),
    updated: Number(raw.updated) || updatedFromIso || Date.now(),
    messages
  };
}

export function mergeConversations(localInput, remoteInput) {
  const local = normalizeConversation(localInput);
  const remote = normalizeConversation(remoteInput);
  if (!local) return remote;
  if (!remote) return local;
  const localIsNewer = local.updated >= remote.updated;
  const messageMap = new Map();
  for (const message of remote.messages) messageMap.set(message.id, message);
  for (const message of local.messages) {
    const existing = messageMap.get(message.id);
    if (!existing || Number(message.time) > Number(existing.time) || (localIsNewer && Number(message.time) === Number(existing.time))) messageMap.set(message.id, message);
  }
  const messages = [...messageMap.values()].sort((a, b) =>
    (Number(a.time) - Number(b.time)) || String(a.id).localeCompare(String(b.id))
  );
  return {
    ...(localIsNewer ? remote : local),
    ...(localIsNewer ? local : remote),
    id: local.id,
    title: localIsNewer ? local.title : remote.title,
    titled: localIsNewer ? local.titled : remote.titled,
    pinned: localIsNewer ? local.pinned : remote.pinned,
    created: Math.min(local.created, remote.created),
    updated: Math.max(local.updated, remote.updated),
    messages
  };
}

export function mergeConversationLists(...lists) {
  const merged = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const chat = normalizeConversation(entry);
      if (!chat) continue;
      merged.set(chat.id, merged.has(chat.id) ? mergeConversations(merged.get(chat.id), chat) : chat);
    }
  }
  return [...merged.values()].sort((a, b) => (b.updated - a.updated) || a.id.localeCompare(b.id));
}

export function serializeConversation(input) {
  return normalizeConversation(input);
}
