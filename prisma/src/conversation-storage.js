// IndexedDB is the durable local fallback for chat history when localStorage
// reaches its quota. The app also keeps a small synchronous cache in localStorage.
const DB_NAME = 'prisma-space-local-history';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'conversation-history-v1';
let opening = null;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB no está disponible.'));
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local.'));
    request.onblocked = () => reject(new Error('El almacenamiento local está ocupado por otra pestaña.'));
  }).catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

export async function readConversationSnapshot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve(Array.isArray(request.result?.records) ? request.result.records : []);
    request.onerror = () => reject(request.error || new Error('No se pudo leer el historial local.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error('Falló la lectura del historial local.'));
  });
}

export async function saveConversationSnapshot(records) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key: SNAPSHOT_KEY,
      savedAt: Date.now(),
      records: Array.isArray(records) ? records : []
    });
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el historial local.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado del historial local.'));
  });
}

export async function clearConversationSnapshot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo limpiar el historial local.'));
    transaction.onabort = () => reject(transaction.error || new Error('Se canceló la limpieza del historial local.'));
  });
}
