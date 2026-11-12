import translations from './locales/en.js';

const STORAGE_KEY = 'prisma-language';
const root = document.documentElement;
const defaultMeta = document.querySelector('meta[name="prisma-default-language"]')?.content;
const savedLanguage = (() => { try { const value = localStorage.getItem(STORAGE_KEY); return value === 'en' || value === 'es' ? value : ''; } catch { return ''; } })();
const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
  ? navigator.languages : [navigator.language || 'es'];
const browserSpanish = browserLanguages.some(value => /^es(?:-|$)/i.test(value));
const initialLanguage = savedLanguage || (defaultMeta === 'en' ? 'en' : defaultMeta === 'es' ? 'es' : browserSpanish ? 'es' : 'en');

const manualTranslations = {
  'Prisma Space — Crea, convierte y experimenta': 'Prisma Space — Create, convert and explore',
  'Prisma Space reúne herramientas digitales, procesamiento local e inteligencia artificial para crear, convertir, optimizar y experimentar en un solo lugar.': 'Prisma Space brings together digital tools, local processing, and artificial intelligence to create, convert, optimize, and explore in one place.',
  'Crea, convierte, optimiza y experimenta con IA en un solo lugar.': 'Create, convert, optimize, and explore with AI in one place.',
  'Restaurando tu espacio de trabajo…': 'Restoring your workspace…',
  'TÚ': 'YOU',
  'PRISMA CORE': 'PRISMA CORE',
  'CONFIGURACIÓN': 'SETTINGS',
  'Ecosistema digital': 'Digital ecosystem'
};
const dictionary = { ...translations, ...manualTranslations };
const originalText = new WeakMap();
const lastText = new WeakMap();
const originalAttributes = new WeakMap();
const lastAttributes = new WeakMap();
let language = initialLanguage;
let applying = false;

const SKIP_TEXT = [
  'script', 'style', 'code', 'pre', 'textarea', 'input', 'svg',
  '[contenteditable="true"]', '[data-no-translate]',
  '.core-message-body', '.core-message-files', '.core-message-engine',
  '.core-message-results', '.tool-output', '#tool-output',
  '.workflow-result', '.artifact-content', '.artifact-preview',
  '.conversation-title', '.conversation-name', '.conversation-item-title',
  '.chat-title', '.history-item-title', '.conversation-search-result-title',
  '.message-content', '.message-bubble', '.markdown-body',
  '.user-content', '.assistant-content', '.user-generated'
].join(',');

const SKIP_ATTRIBUTES = [
  'script', 'style', 'code', 'pre', '[data-no-translate]',
  '.core-message-body', '.tool-output', '#tool-output',
  '.conversation-title', '.conversation-name', '.conversation-item-title',
  '.chat-title', '.history-item-title', '.message-content',
  '.markdown-body', '.user-content', '.assistant-content'
].join(',');

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  return leading + translated + trailing;
}

function translateValue(source) {
  const value = String(source ?? '');
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (dictionary[trimmed]) return preserveWhitespace(value, dictionary[trimmed]);

  let match = trimmed.match(/^(\d+)\s+(herramientas?)$/i);
  if (match) return preserveWhitespace(value, match[1] + ' tools');
  match = trimmed.match(/^(\d+)\s+(archivos?)$/i);
  if (match) return preserveWhitespace(value, match[1] + (match[2].toLowerCase().startsWith('archivo') ? ' files' : ' files'));
  match = trimmed.match(/^(\d+)\s+(páginas?)$/i);
  if (match) return preserveWhitespace(value, match[1] + ' pages');
  match = trimmed.match(/^(\d+)\s+(modelos?)\s+disponibles$/i);
  if (match) return preserveWhitespace(value, match[1] + ' models available');
  match = trimmed.match(/^(\d+)\s+(motores?)\s+disponibles$/i);
  if (match) return preserveWhitespace(value, match[1] + ' engines available');
  match = trimmed.match(/^(\d+)\s+credenciales$/i);
  if (match) return preserveWhitespace(value, match[1] + ' credentials');
  match = trimmed.match(/^(\d+)\s+resultados?$/i);
  if (match) return preserveWhitespace(value, match[1] + ' results');
  match = trimmed.match(/^(\d+)\s+palabras?$/i);
  if (match) return preserveWhitespace(value, match[1] + ' words');

  const prefixes = [
    ['¡Bienvenido a Prisma,', 'Welcome to Prisma,'],
    ['Conectando con', 'Connecting to'],
    ['No fue posible continuar con', 'Could not continue with'],
    ['No se pudo completar la solicitud:', 'The request could not be completed:'],
    ['No se pudo completar el flujo:', 'The workflow could not be completed:'],
    ['Texto extraído ·', 'Extracted text ·'],
    ['Imagen de', 'Image of'],
    ['Canción original compuesta con', 'Original song composed with'],
    ['Se cambió a otro motor conectado después de un fallo.', 'Switched to another connected engine after a failure.']
  ];
  for (const [prefix, replacement] of prefixes) {
    if (trimmed.startsWith(prefix)) return preserveWhitespace(value, replacement + trimmed.slice(prefix.length));
  }
  return value;
}

function isSkippedText(node) {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest(SKIP_TEXT));
}

function translateTextNode(node) {
  if (!node?.isConnected || isSkippedText(node)) return;
  const current = node.data;
  const last = lastText.get(node);
  if (last !== undefined && current !== last) {
    originalText.set(node, current);
    lastText.delete(node);
  }
  if (!originalText.has(node)) originalText.set(node, current);
  const original = originalText.get(node);
  const next = language === 'en' ? translateValue(original) : original;
  if (node.data !== next) {
    applying = true;
    node.data = next;
    lastText.set(node, next);
    applying = false;
  } else if (lastText.has(node)) {
    lastText.set(node, next);
  }
}

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'content'];
function translateAttribute(element, attribute) {
  if (!element?.isConnected || element.closest(SKIP_ATTRIBUTES)) return;
  const current = element.getAttribute(attribute);
  if (current === null) return;
  let originals = originalAttributes.get(element);
  if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
  let lasts = lastAttributes.get(element);
  if (!lasts) { lasts = new Map(); lastAttributes.set(element, lasts); }
  const last = lasts.get(attribute);
  if (last !== undefined && current !== last) {
    originals.set(attribute, current);
    lasts.delete(attribute);
  }
  if (!originals.has(attribute)) originals.set(attribute, current);
  const original = originals.get(attribute);
  const next = language === 'en' ? translateValue(original) : original;
  if (current !== next) {
    applying = true;
    element.setAttribute(attribute, next);
    lasts.set(attribute, next);
    applying = false;
  } else if (lasts.has(attribute)) {
    lasts.set(attribute, next);
  }
}

function applyAll() {
  root.lang = language;
  root.dataset.language = language;
  const locale = document.querySelector('meta[property="og:locale"]');
  if (locale) locale.content = language === 'en' ? 'en_US' : 'es_ES';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) translateTextNode(node);
  root.querySelectorAll('*').forEach(element => ATTRIBUTES.forEach(attribute => translateAttribute(element, attribute)));
  updateLanguageButton();
}

function updateLanguageButton() {
  const button = document.getElementById('prisma-language-toggle');
  if (!button) return;
  button.textContent = language === 'en' ? 'ES' : 'EN';
  const label = language === 'en' ? 'Switch to Spanish' : 'Switch to English';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('aria-pressed', language === 'en' ? 'true' : 'false');
}

function installLanguageButton() {
  if (document.getElementById('prisma-language-toggle')) return;
  const host = document.querySelector('.topbar-actions') || document.querySelector('.topbar') || document.querySelector('.app-topbar');
  if (!host) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'prisma-language-toggle';
  button.className = 'icon-button prisma-language-toggle';
  button.addEventListener('click', () => {
    setLanguage(language === 'en' ? 'es' : 'en', { persist: true });
  });
  host.append(button);
  updateLanguageButton();
}

function setLanguage(next, { persist = true } = {}) {
  if (next !== 'en' && next !== 'es') return;
  language = next;
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }
  applyAll();
  document.dispatchEvent(new CustomEvent('prisma:language-change', { detail: { language } }));
}

const style = document.createElement('style');
style.textContent = '.prisma-language-toggle{min-width:38px;padding-inline:9px;font-size:11px;font-weight:800;letter-spacing:.06em;line-height:1}';
document.head.append(style);

applyAll();
installLanguageButton();

const observer = new MutationObserver(records => {
  if (applying) return;
  for (const record of records) {
    if (record.type === 'characterData') translateTextNode(record.target);
    if (record.type === 'attributes') translateAttribute(record.target, record.attributeName);
    if (record.type === 'childList') {
      record.addedNodes.forEach(added => {
        if (added.nodeType === Node.TEXT_NODE) translateTextNode(added);
        else if (added.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(added, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) translateTextNode(node);
          ATTRIBUTES.forEach(attribute => {
            if (added.hasAttribute?.(attribute)) translateAttribute(added, attribute);
          });
          added.querySelectorAll?.('*').forEach(element => ATTRIBUTES.forEach(attribute => translateAttribute(element, attribute)));
        }
      });
    }
  }
  installLanguageButton();
});
observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });

window.prismaI18n = Object.freeze({
  get language() { return language; },
  setLanguage,
  t(value) { return language === 'en' ? translateValue(value) : value; }
});
