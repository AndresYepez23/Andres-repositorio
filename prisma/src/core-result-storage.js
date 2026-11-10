// Generated-file storage is separate from synced conversations.
// Never push binary user files into localStorage, RLS conversation rows, or LLMs.
const DB_NAME = 'prisma-space-generated-files-v1';
const STORE = 'files';
const cache = new Map();
let opening = null;

export function createGeneratedFileKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  const bytes = new Uint8Array(24);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function')
    throw Error('Este navegador no permite generar identificadores seguros de archivos.');
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function openDB() {
  if (opening) return opening;
  if (typeof indexedDB === 'undefined') return Promise.reject(Error('IndexedDB no disponible en este navegador.'));
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const files = db.createObjectStore(STORE, {keyPath: 'key'});
        files.createIndex('chatId', 'chatId', {unique: false});
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || Error('No se pudo abrir el almacenamiento de resultados.'));
    request.onblocked = () => reject(Error('El almacenamiento de resultados está bloqueado por otra pestaña.'));
  }).catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

// Cache first to keep a working download while IndexedDB writes.
export async function saveGeneratedFile({key,blob,filename,chatId}) {
  if (!key || !(blob instanceof Blob) || !blob.size)
    throw Error('El resultado está vacío o no es un archivo válido.');
  cache.set(key, blob);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      key,
      chatId: String(chatId || ''),
      filename: String(filename || 'prisma-resultado'),
      type: blob.type,
      size: blob.size,
      savedAt: Date.now(),
      blob
    });
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error || Error('No se pudo guardar el archivo generado.'));
    tx.onabort = () => reject(tx.error || Error('Se interrumpió el guardado del archivo.'));
  });
}

export async function loadGeneratedFile(key) {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => {
      const blob = request.result?.blob;
      if (blob instanceof Blob && blob.size) {
        cache.set(key, blob);
        resolve(blob);
      } else resolve(null);
    };
    request.onerror = () => reject(request.error || Error('No se pudo recuperar el archivo.'));
  });
}

export async function deleteGeneratedFilesForChat(chatId) {
  if (!chatId) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.index('chatId').openCursor(IDBKeyRange.only(String(chatId)));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cache.delete(cursor.value.key);
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || Error('No se pudieron limpiar los archivos del chat.'));
  });
}

export async function clearGeneratedFiles() {
  cache.clear();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || Error('No se pudieron limpiar los archivos generados.'));
  });
}
