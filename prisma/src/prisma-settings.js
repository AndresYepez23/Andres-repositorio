import { openPrismaAuth } from './prisma-account.js';

const $ = (selector, root = document) => root.querySelector(selector);
const SETTINGS_KEY = 'prisma-send-shortcut';
const sections = {
  general: { title: 'General', description: 'Configura el comportamiento básico de Prisma Space.' },
  personalization: { title: 'Personalización', description: 'Adapta la apariencia y la comodidad de tu espacio.' },
  account: { title: 'Perfil y cuenta', description: 'Administra tu identidad y la sincronización de tus conversaciones.' },
  privacy: { title: 'Privacidad y datos', description: 'Controla la información que permanece en este dispositivo.' },
  shortcuts: { title: 'Atajos de teclado', description: 'Trabaja más rápido con los comandos disponibles.' },
  help: { title: 'Centro de ayuda', description: 'Resuelve dudas y encuentra dónde solicitar asistencia.' },
  whatsNew: { title: 'Notas de la versión', description: 'Cambios recientes de Prisma Space.' }
};

function currentThemePreference() {
  try {
    const value = localStorage.getItem('prisma-theme');
    return ['light', 'dark', 'system'].includes(value) ? value : 'dark';
  } catch { return 'dark'; }
}
function resolveTheme(preference) {
  if (preference === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return preference === 'light' ? 'light' : 'dark';
}
function applyThemePreference(preference) {
  const selected = ['light', 'dark', 'system'].includes(preference) ? preference : 'dark';
  try { localStorage.setItem('prisma-theme', selected); } catch {}
  const theme = resolveTheme(selected);
  document.documentElement.dataset.theme = theme;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f4f5f8' : '#101218';
  const status = $('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (status) status.content = theme === 'light' ? 'default' : 'black-translucent';
  document.dispatchEvent(new CustomEvent('prisma:theme-changed', { detail: { preference: selected, theme } }));
  return selected;
}
function applyAppearancePreferences() {
  try {
    document.body.classList.toggle('prisma-compact-ui', localStorage.getItem('prisma-compact-ui') === 'true');
    document.documentElement.dataset.reduceMotion = localStorage.getItem('prisma-reduce-motion') === 'true' ? 'true' : 'false';
  } catch {}
}
function closeProfileHelp() {
  const help = $('#profile-help-menu');
  const trigger = $('#profile-open-help');
  help?.classList.add('hidden');
  trigger?.setAttribute('aria-expanded', 'false');
}
function closeProfileMenu() {
  $('#profile-menu')?.classList.add('hidden');
  $('#profile-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('profile-open');
  closeProfileHelp();
}
function positionProfileHelp() {
  const help = $('#profile-help-menu');
  const menu = $('#profile-menu');
  const trigger = $('#profile-open-help');
  if (!help || !menu || !trigger) return;
  const menuRect = menu.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const width = Math.min(304, window.innerWidth - 24);
  let left = menuRect.left - width - 10;
  if (left < 12) left = Math.min(window.innerWidth - width - 12, menuRect.right + 10);
  const estimatedHeight = Math.min(help.scrollHeight || 430, window.innerHeight - 24);
  const top = Math.max(12, Math.min(triggerRect.top - 8, window.innerHeight - estimatedHeight - 12));
  help.style.left = left + 'px';
  help.style.top = top + 'px';
  help.style.width = width + 'px';
}
const isMobileSettings = () => window.matchMedia('(max-width: 900px)').matches;
function openSettings(section = 'general') {
  const panel = $('#prisma-settings');
  if (!panel) return;
  closeProfileMenu();
  // Mobile: show a section list first, never a squeezed desktop sidebar.
  setSettingsSection(section === 'home' && !isMobileSettings() ? 'general' : section);
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('prisma-settings-open');
  (isMobileSettings() ? $('#settings-mobile-close') : $('#settings-close'))?.focus();
}
function closeSettings() {
  const panel = $('#prisma-settings');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('prisma-settings-open');
  $('#profile-toggle')?.focus();
}
function mobileHomeRow(section, icon, title, description = '') {
  return '<button type="button" class="settings-home-row" data-settings-open="' + section + '">' +
    '<span class="settings-home-row-icon" data-icon="' + icon + '" aria-hidden="true"></span>' +
    '<span class="settings-home-row-label"><strong>' + title + '</strong>' +
    (description ? '<small>' + description + '</small>' : '') + '</span>' +
    '<span class="settings-home-row-chevron" data-icon="chevron-right" aria-hidden="true"></span></button>';
}
function mobileHomeContent() {
  const signedIn = !$('#account-signout')?.classList.contains('hidden');
  return [
    '<div class="settings-mobile-home">',
      '<button type="button" class="settings-home-profile" data-settings-open="account">',
        '<span class="settings-home-avatar" aria-hidden="true" id="settings-home-avatar"></span>',
        '<span class="settings-home-profile-label"><strong id="settings-home-name"></strong><small id="settings-home-email"></small></span>',
        '<span data-icon="chevron-right" class="settings-home-profile-chevron" aria-hidden="true"></span>',
      '</button>',
      '<section class="settings-home-group"><h2>Personalización</h2><div class="settings-home-list">',
        mobileHomeRow('personalization','palette','Apariencia y personalización','Tema, presentación y animaciones'),
        mobileHomeRow('account','user-round','Perfil y cuenta','Identidad y sincronización'),
      '</div></section>',
      '<section class="settings-home-group"><h2>Configuración de la aplicación</h2><div class="settings-home-list">',
        mobileHomeRow('general','settings','General','Pantalla de inicio, idioma y envío'),
        mobileHomeRow('shortcuts','keyboard','Atajos de teclado'),
        mobileHomeRow('privacy','shield-check','Privacidad y datos'),
        '<button type="button" class="settings-home-row" data-settings-action="open-ai"><span class="settings-home-row-icon" data-icon="sparkles" aria-hidden="true"></span><span class="settings-home-row-label"><strong>Modelos y conexiones IA</strong><small>Administrar proveedores en Laboratorio IA</small></span><span class="settings-home-row-chevron" data-icon="chevron-right" aria-hidden="true"></span></button>',
      '</div></section>',
      '<section class="settings-home-group"><h2>Ayuda y soporte</h2><div class="settings-home-list">',
        mobileHomeRow('help','life-buoy','Centro de ayuda'),
        mobileHomeRow('whatsNew','book-open','Notas de la versión'),
      '</div></section>',
      signedIn ? '<button type="button" id="settings-home-signout" class="settings-home-signout"><span data-icon="log-out"></span>Cerrar sesión</button>' : '',
      '<p class="settings-home-footer">PRISMA SPACE 1.0 · BETA</p>',
    '</div>'
  ].join('');
}
function generalContent() {
  const shortcut = (() => {
    try { return localStorage.getItem(SETTINGS_KEY) === 'ctrl-enter' ? 'ctrl-enter' : 'enter'; }
    catch { return 'enter'; }
  })();
  const initialView = (() => {
    try { return localStorage.getItem('prisma-start-view') === 'explore' ? 'explore' : 'core'; }
    catch { return 'core'; }
  })();
  return [
    '<section class="settings-card settings-general-card">',
      '<div class="settings-row"><span class="settings-field-icon" data-icon="house"></span><div><strong>Pantalla de inicio</strong><small>Elige dónde empieza Prisma cuando abras la aplicación.</small></div>',
        '<select class="settings-select" id="settings-start-view" aria-label="Pantalla de inicio">',
          '<option value="core"' + (initialView === 'core' ? ' selected' : '') + '>Prisma Core</option>',
          '<option value="explore"' + (initialView === 'explore' ? ' selected' : '') + '>Herramientas</option>',
        '</select>',
      '</div>',
      '<div class="settings-row"><span class="settings-field-icon" data-icon="globe"></span><div><strong>Idioma</strong><small>Idioma disponible para la interfaz.</small></div><span class="settings-static-value">Español</span></div>',
      '<div class="settings-row"><span class="settings-field-icon" data-icon="keyboard"></span><div><strong>Atajo para enviar</strong><small>Controla cuándo Enter envía tu mensaje.</small></div>',
        '<select class="settings-select" id="settings-send-shortcut" aria-label="Atajo para enviar">',
          '<option value="enter"' + (shortcut === 'enter' ? ' selected' : '') + '>Enter</option>',
          '<option value="ctrl-enter"' + (shortcut === 'ctrl-enter' ? ' selected' : '') + '>Ctrl + Enter</option>',
        '</select>',
      '</div>',
    '</section>',
    '<p class="settings-footnote">Shift + Enter siempre inserta una nueva línea. En Mac puedes usar ⌘ + Enter si seleccionas el segundo atajo.</p>'
  ].join('');
}
function personalizationContent() {
  const compact = (() => { try { return localStorage.getItem('prisma-compact-ui') === 'true'; } catch { return false; } })();
  const reduced = (() => { try { return localStorage.getItem('prisma-reduce-motion') === 'true'; } catch { return false; } })();
  const theme = currentThemePreference();
  return [
    '<section class="settings-card settings-theme-card">',
      '<div class="settings-card-heading"><strong>Tema</strong><small>Elige cómo se ve Prisma Space.</small></div>',
      '<div class="settings-theme-options">',
        '<button type="button" class="settings-theme-option" data-theme-choice="system" aria-pressed="' + (theme === 'system') + '"><span class="settings-theme-preview theme-preview-system"><i></i></span><strong>Automático</strong><small>Usar el tema del dispositivo</small></button>',
        '<button type="button" class="settings-theme-option" data-theme-choice="light" aria-pressed="' + (theme === 'light') + '"><span class="settings-theme-preview theme-preview-light"><i></i></span><strong>Claro</strong><small>Interfaz luminosa</small></button>',
        '<button type="button" class="settings-theme-option" data-theme-choice="dark" aria-pressed="' + (theme === 'dark') + '"><span class="settings-theme-preview theme-preview-dark"><i></i></span><strong>Oscuro</strong><small>Interfaz de baja luz</small></button>',
      '</div>',
    '</section>',
    '<section class="settings-card settings-preference-card">',
      '<label class="settings-switch-row"><span><strong>Interfaz compacta</strong><small>Reduce algunos espacios para mostrar más contenido.</small></span><input id="settings-compact-mode" type="checkbox"' + (compact ? ' checked' : '') + '><i aria-hidden="true"></i></label>',
      '<label class="settings-switch-row"><span><strong>Reducir animaciones</strong><small>Limita las transiciones y movimientos de la interfaz.</small></span><input id="settings-reduced-motion" type="checkbox"' + (reduced ? ' checked' : '') + '><i aria-hidden="true"></i></label>',
    '</section>'
  ].join('');
}
function accountContent() {
  const name = $('#profile-menu-title')?.textContent?.trim() || 'Tu espacio en Prisma';
  const email = $('#account-menu-state')?.textContent?.trim() || 'Modo invitado';
  const sync = $('#account-sync');
  const signout = $('#account-signout');
  return [
    '<section class="settings-card settings-account-card">',
      '<div class="settings-account-avatar" aria-hidden="true"><span data-icon="user-round"></span></div>',
      '<div class="settings-account-identity"><strong id="settings-account-name"></strong><small id="settings-account-email"></small></div>',
      '<button type="button" class="settings-action-button" id="settings-manage-account">Gestionar perfil y cuenta <span data-icon="arrow-right"></span></button>',
      sync && !sync.classList.contains('hidden') ? '<button type="button" class="settings-action-button" id="settings-sync-account"><span data-icon="cloud"></span> Sincronizar ahora</button>' : '',
      signout && !signout.classList.contains('hidden') ? '<button type="button" class="settings-action-button settings-danger-action" id="settings-signout"><span data-icon="log-out"></span> Cerrar sesión</button>' : '',
    '</section>',
    '<p class="settings-footnote">La sincronización es opcional. Puedes seguir utilizando las herramientas disponibles sin iniciar sesión.</p>'
  ].join('');
}
function privacyContent() {
  return [
    '<section class="settings-card">',
      '<div class="settings-row"><div><strong>Privacidad y uso</strong><small>Consulta qué datos se procesan localmente y cuándo intervienen proveedores externos.</small></div><a class="settings-inline-link" href="./privacy.html#privacidad">Abrir <span data-icon="external-link"></span></a></div>',
      '<div class="settings-row"><div><strong>Condiciones de uso</strong><small>Consulta las condiciones y recomendaciones de uso de Prisma Space.</small></div><a class="settings-inline-link" href="./privacy.html#condiciones">Abrir <span data-icon="external-link"></span></a></div>',
    '</section>',
    '<section class="settings-card settings-danger-card">',
      '<div><strong>Borrar datos de este dispositivo</strong><small>Elimina conversaciones locales, favoritos y preferencias guardadas en este navegador. Esta acción no se puede deshacer.</small></div>',
      '<button type="button" id="clear-local-data" class="settings-danger-button"><span data-icon="trash-2"></span> Borrar datos</button>',
    '</section>',
    '<p class="settings-footnote">Borrar los datos locales no elimina información que un proveedor externo ya haya recibido.</p>'
  ].join('');
}
function shortcutsContent() {
  const shortcut = (() => { try { return localStorage.getItem(SETTINGS_KEY) === 'ctrl-enter' ? 'Ctrl + Enter' : 'Enter'; } catch { return 'Enter'; } })();
  return [
    '<section class="settings-card settings-shortcuts-card">',
      '<div class="settings-shortcut-row"><span><kbd>Ctrl</kbd> <kbd>K</kbd> <small>Buscar herramientas o conversaciones</small></span></div>',
      '<div class="settings-shortcut-row"><span><kbd>Ctrl</kbd> <kbd>,</kbd> <small>Abrir configuración</small></span></div>',
      '<div class="settings-shortcut-row"><span><kbd>Esc</kbd> <small>Cerrar el menú o panel abierto</small></span></div>',
      '<div class="settings-shortcut-row"><span><kbd>Shift</kbd> <kbd>Enter</kbd> <small>Insertar una nueva línea</small></span></div>',
      '<div class="settings-shortcut-row"><span><kbd>' + shortcut + '</kbd> <small>Enviar mensaje según tu preferencia actual</small></span></div>',
    '</section>',
    '<p class="settings-footnote">En Mac, Ctrl puede sustituirse por ⌘ cuando corresponda.</p>'
  ].join('');
}
function helpContent() {
  return [
    '<div class="settings-detail-section-label">Ayuda y soporte</div>',
    '<section class="settings-card settings-help-links">',
      '<a class="settings-help-link" href="./privacy.html#privacidad"><span class="settings-help-link-icon" data-icon="shield-check"></span><span>Centro de privacidad</span><span class="settings-help-link-chevron" data-icon="chevron-right"></span></a>',
      '<a class="settings-help-link" href="https://github.com/AndresYepez23/PRISMA/issues/new" target="_blank" rel="noopener noreferrer"><span class="settings-help-link-icon" data-icon="bug"></span><span>Informar de un problema</span><span class="settings-help-link-chevron" data-icon="external-link"></span></a>',
      '<a class="settings-help-link" href="https://github.com/AndresYepez23/PRISMA/issues" target="_blank" rel="noopener noreferrer"><span class="settings-help-link-icon" data-icon="life-buoy"></span><span>Comunidad y soporte</span><span class="settings-help-link-chevron" data-icon="external-link"></span></a>',
      '<button type="button" class="settings-help-link" id="settings-help-install"><span class="settings-help-link-icon" data-icon="download"></span><span>Instalar Prisma Space</span><span class="settings-help-link-chevron" data-icon="chevron-right"></span></button>',
    '</section>',
    '<div class="settings-detail-section-label">Preguntas frecuentes</div>',
    '<section class="settings-card settings-help-card">',
      '<details><summary>¿Necesito una cuenta para utilizar Prisma?</summary><p>No. Puedes explorar el catálogo y utilizar las herramientas disponibles sin registrarte. La cuenta permite acceder a funciones de perfil y sincronización cuando estén disponibles.</p></details>',
      '<details><summary>¿Dónde se procesan mis archivos?</summary><p>Las herramientas locales procesan los archivos en tu dispositivo. Las herramientas que utilizan servicios externos envían los datos necesarios al proveedor correspondiente. Revisa nuestra política de privacidad antes de compartir contenido sensible.</p></details>',
      '<details><summary>¿Cómo instalo Prisma en mi teléfono?</summary><p>En iPhone, abre Prisma en Safari, pulsa Compartir y elige «Añadir a pantalla de inicio». En Android, usa la opción Instalar del navegador.</p></details>',
      '<details><summary>¿Cómo puedo informar de un error?</summary><p>Describe los pasos para reproducirlo y el navegador. Si adjuntas una captura, oculta cualquier dato personal.</p><a href="https://github.com/AndresYepez23/PRISMA/issues/new" target="_blank" rel="noopener noreferrer">Abrir informe de errores <span data-icon="external-link"></span></a></details>',
    '</section>'
  ].join('');
}
function whatsNewContent() {
  return [
    '<section class="settings-release-card">',
      '<div class="settings-release-kicker">PRISMA SPACE · 1.0 BETA</div>',
      '<h2>Una experiencia más clara y organizada</h2>',
      '<p>El espacio personal ahora reúne los accesos de cuenta, configuración y ayuda en un menú más compacto.</p>',
      '<ul>',
        '<li>Centro de configuración con preferencias generales y de apariencia.</li>',
        '<li>Atajos de teclado configurables para enviar mensajes.</li>',
        '<li>Controles de privacidad y datos locales en un solo lugar.</li>',
        '<li>Menú de ayuda con accesos a privacidad, instalación y soporte.</li>',
      '</ul>',
    '</section>'
  ].join('');
}
function sectionContent(section) {
  switch (section) {
    case 'general': return generalContent();
    case 'personalization': return personalizationContent();
    case 'account': return accountContent();
    case 'privacy': return privacyContent();
    case 'shortcuts': return shortcutsContent();
    case 'help': return helpContent();
    case 'whatsNew': return whatsNewContent();
    default: return generalContent();
  }
}
function paintIcons(root) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    if (node.innerHTML.trim()) return;
    const name = node.dataset.icon;
    const paths = {
      'user-round': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
      'chevron-right': '<path d="m9 18 6-6-6-6"/>',
      'house': '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
      'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18m0-18c5 4 5 14 0 18"/>',
      'keyboard': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15h8"/>',
      'settings': '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 1.1.9-1.2 2.1-1.4-.5-1.4.8-.3 1.5h-2.4l-.3-1.5-1.5-.8-1.3.5-1.2-2.1 1.1-.9a7 7 0 0 1 0-1.7l-1.1-.9 1.2-2.1 1.3.5 1.5-.8.3-1.4h2.4l.3 1.4 1.4.8 1.4-.5 1.2 2.1-1.1.9a7 7 0 0 1 0 1.7Z"/>',
      'palette': '<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.7-4.3 1.8 1.8 0 0 1 1.2-3.1H19a2 2 0 0 0 2-2A9 9 0 0 0 12 3Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="7" r="1"/>',
      'shield-check': '<path d="M12 22c5-2 8-6 8-11V5l-8-3-8 3v6c0 5 3 9 8 11Z"/><path d="m9 12 2 2 4-4"/>',
      'sparkles': '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z"/><path d="m19 17 .8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z"/>',
      'life-buoy': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.6 5.6 4.3 4.3m4.2 4.2 4.3 4.3m0-12.8-4.3 4.3m-4.2 4.2-4.3 4.3"/>',
      'book-open': '<path d="M12 7v14m0-14C9.5 4.8 6.3 4.5 3 5v14c3.3-.5 6.5-.2 9 2m0-14c2.5-2.2 5.7-2.5 9-2v14c-3.3-.5-6.5-.2-9 2"/>',
      'bug': '<rect x="7" y="7" width="10" height="14" rx="5"/><path d="M8 8 6 6m10 2 2-2M9 4h6M4 13h3m10 0h3M5 18l3-2m11 2-3-2"/>',
      'cloud': '<path d="M20 16.2A4.8 4.8 0 0 0 18 7h-1.2A7 7 0 1 0 4 16.3"/>',
      'log-out': '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
      'external-link': '<path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
      'trash-2': '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>',
      'download': '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/>'
    };
    if (paths[name]) node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  });
}
function setSettingsSection(section) {
  const selected = section === 'home' && isMobileSettings() ? 'home' : (sections[section] ? section : 'general');
  const panel = $('#prisma-settings');
  if (!panel) return;
  panel.dataset.section = selected;
  const isHome = selected === 'home';
  $('#settings-title').textContent = isHome ? 'Configuración' : sections[selected].title;
  $('#settings-description').textContent = isHome ? 'Personaliza Prisma Space.' : sections[selected].description;
  $('#settings-mobile-title').textContent = isHome ? 'Configuración' : sections[selected].title;
  $('#settings-mobile-back')?.classList.toggle('hidden', isHome);
  $('#settings-mobile-back')?.setAttribute('aria-label', isHome ? 'Cerrar configuración' : 'Volver a configuración');
  $('#settings-content').innerHTML = isHome ? mobileHomeContent() : sectionContent(selected);
  panel.querySelectorAll('[data-settings-section]').forEach(button => {
    const active = button.dataset.settingsSection === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (selected === 'account') {
    $('#settings-account-name').textContent = $('#profile-menu-title')?.textContent?.trim() || 'Tu espacio en Prisma';
    $('#settings-account-email').textContent = $('#account-menu-state')?.textContent?.trim() || 'Modo invitado';
  }
  if (isHome) {
    const name = $('#profile-menu-title')?.textContent?.trim() || 'Tu espacio en Prisma';
    $('#settings-home-name').textContent = name;
    $('#settings-home-email').textContent = $('#account-menu-state')?.textContent?.trim() || 'Modo invitado';
    $('#settings-home-avatar').textContent = name === 'Prisma Space'
      ? 'P' : (name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es') || 'P');
  }
  paintIcons($('#settings-content'));
  $('#settings-content').scrollTop = 0;
  updateThemeChoices();
  $('#settings-content').querySelectorAll('[data-theme-choice]').forEach(button => {
    button.addEventListener('click', () => {
      applyThemePreference(button.dataset.themeChoice);
      updateThemeChoices();
    });
  });
  $('#settings-start-view')?.addEventListener('change', event => {
    try { localStorage.setItem('prisma-start-view', event.target.value === 'explore' ? 'explore' : 'core'); } catch {}
  });
  $('#settings-home-signout')?.addEventListener('click', () => { closeSettings(); $('#account-signout')?.click(); });
  $('#settings-content').querySelectorAll('[data-settings-action="open-ai"]').forEach(button => {
    button.addEventListener('click', () => { closeSettings(); document.querySelector('[data-view="ai"]')?.click(); });
  });
  $('#settings-send-shortcut')?.addEventListener('change', event => {
    try { localStorage.setItem(SETTINGS_KEY, event.target.value === 'ctrl-enter' ? 'ctrl-enter' : 'enter'); } catch {}
    document.dispatchEvent(new CustomEvent('prisma:send-shortcut-changed', { detail: { value: event.target.value } }));
  });
  $('#settings-compact-mode')?.addEventListener('change', event => {
    try { localStorage.setItem('prisma-compact-ui', String(event.target.checked)); } catch {}
    document.body.classList.toggle('prisma-compact-ui', event.target.checked);
  });
  $('#settings-reduced-motion')?.addEventListener('change', event => {
    try { localStorage.setItem('prisma-reduce-motion', String(event.target.checked)); } catch {}
    document.documentElement.dataset.reduceMotion = event.target.checked ? 'true' : 'false';
  });
  $('#settings-manage-account')?.addEventListener('click', () => { closeSettings(); openPrismaAuth(); });
  $('#settings-sync-account')?.addEventListener('click', () => $('#account-sync')?.click());
  $('#settings-signout')?.addEventListener('click', () => {
    closeSettings();
    $('#account-signout')?.click();
  });
  $('#settings-help-install')?.addEventListener('click', () => {
    closeSettings();
    document.dispatchEvent(new Event('prisma:request-install'));
  });
}
function updateThemeChoices() {
  const selected = currentThemePreference();
  $('#settings-content')?.querySelectorAll('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function initProfileHelp() {
  const trigger = $('#profile-open-help');
  const help = $('#profile-help-menu');
  const profileMenu = $('#profile-menu');
  if (!trigger || !help) return;
  if (help.parentElement !== document.body) document.body.append(help);
  help.addEventListener('click', event => event.stopPropagation());
  trigger.addEventListener('click', event => {
    event.stopPropagation();
    if (isMobileSettings()) {
      openSettings('help');
      return;
    }
    const open = help.classList.contains('hidden');
    closeProfileHelp();
    if (open) {
      help.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      positionProfileHelp();
    }
  });
  help.querySelectorAll('[data-help-section]').forEach(button => {
    button.addEventListener('click', () => openSettings(button.dataset.helpSection));
  });
  $('#help-profile-install')?.addEventListener('click', () => {
    closeProfileMenu();
    document.dispatchEvent(new Event('prisma:request-install'));
  });
  window.addEventListener('resize', () => {
    if (!help.classList.contains('hidden')) positionProfileHelp();
  });
  document.addEventListener('prisma:close-profile', closeProfileMenu);
  document.addEventListener('click', event => {
    if (!help.classList.contains('hidden') && !help.contains(event.target) && !profileMenu?.contains(event.target)) closeProfileHelp();
  });
}
export function initPrismaSettings() {
  applyAppearancePreferences();
  initProfileHelp();
  $('#profile-open-settings')?.addEventListener('click', () => openSettings('home'));
  $('#prisma-settings')?.querySelectorAll('[data-settings-section]').forEach(button => {
    button.addEventListener('click', () => setSettingsSection(button.dataset.settingsSection));
  });
  $('#settings-close')?.addEventListener('click', closeSettings);
  $('#settings-back')?.addEventListener('click', closeSettings);
  $('#settings-mobile-close')?.addEventListener('click', closeSettings);
  $('#settings-mobile-back')?.addEventListener('click', () => {
    if ($('#prisma-settings')?.dataset.section === 'home') closeSettings();
    else setSettingsSection('home');
  });
  $('#prisma-settings')?.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link) return;
    const action = event.target.closest('[data-settings-open]');
    if (action) setSettingsSection(action.dataset.settingsOpen);
  });
  document.addEventListener('prisma:theme-changed', updateThemeChoices);
  const viewportQuery = window.matchMedia('(max-width: 900px)');
  const syncResponsiveView = () => {
    const panel = $('#prisma-settings');
    if (panel && !panel.classList.contains('hidden') && !viewportQuery.matches && panel.dataset.section === 'home')
      setSettingsSection('general');
  };
  if (viewportQuery.addEventListener) viewportQuery.addEventListener('change', syncResponsiveView);
  else viewportQuery.addListener?.(syncResponsiveView);
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleSystemTheme = () => {
    if (currentThemePreference() === 'system') applyThemePreference('system');
  };
  if (media?.addEventListener) media.addEventListener('change', handleSystemTheme);
  else media?.addListener?.(handleSystemTheme);
  document.addEventListener('keydown', event => {
    const settings = $('#prisma-settings');
    const isOpen = settings && !settings.classList.contains('hidden');
    if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      if (isOpen) closeSettings();
      else openSettings('home');
      return;
    }
    if (event.key === 'Escape') {
      if (isOpen) { event.preventDefault(); closeSettings(); }
      else closeProfileHelp();
      return;
    }
    if (isOpen && event.key === 'Tab') {
      const focusable = [...settings.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])')]
        .filter(node => node.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
