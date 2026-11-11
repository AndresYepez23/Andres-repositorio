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
function openSettings(section = 'general') {
  const panel = $('#prisma-settings');
  if (!panel) return;
  closeProfileMenu();
  setSettingsSection(section);
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('prisma-settings-open');
  $('#settings-close')?.focus();
}
function closeSettings() {
  const panel = $('#prisma-settings');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('prisma-settings-open');
  $('#profile-open-settings')?.focus();
}
function generalContent() {
  const shortcut = (() => {
    try { return localStorage.getItem(SETTINGS_KEY) === 'ctrl-enter' ? 'ctrl-enter' : 'enter'; }
    catch { return 'enter'; }
  })();
  return [
    '<section class="settings-card">',
      '<div class="settings-row"><div><strong>Idioma</strong><small>Idioma de la interfaz de Prisma Space.</small></div><span class="settings-static-value">Español</span></div>',
      '<div class="settings-row"><div><strong>Atajo para enviar</strong><small>Elige cuándo Enter envía tu mensaje o inserta una nueva línea.</small></div>',
        '<select class="settings-select" id="settings-send-shortcut" aria-label="Atajo para enviar">',
          '<option value="enter"' + (shortcut === 'enter' ? ' selected' : '') + '>Enter</option>',
          '<option value="ctrl-enter"' + (shortcut === 'ctrl-enter' ? ' selected' : '') + '>Ctrl + Enter</option>',
        '</select>',
      '</div>',
    '</section>',
    '<p class="settings-footnote">Shift + Enter siempre inserta una nueva línea. En Mac también puedes usar ⌘ + Enter cuando selecciones esa opción.</p>'
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
    '<section class="settings-card settings-help-card">',
      '<details><summary>¿Necesito una cuenta para utilizar Prisma?</summary><p>No. Puedes explorar el catálogo y utilizar las herramientas disponibles sin registrarte. La cuenta permite acceder a funciones de perfil y sincronización cuando estén disponibles.</p></details>',
      '<details><summary>¿Dónde se procesan mis archivos?</summary><p>Las herramientas locales procesan los archivos en tu dispositivo. Las herramientas que utilizan servicios externos envían los datos necesarios al proveedor correspondiente; revisa la información de privacidad antes de compartir contenido sensible.</p></details>',
      '<details><summary>¿Cómo instalo Prisma Space?</summary><p>Abre el menú de ayuda y selecciona «Descargar aplicaciones». En iPhone y iPad, utiliza Compartir en Safari y elige «Añadir a pantalla de inicio».</p></details>',
      '<details><summary>¿Cómo puedo reportar un problema?</summary><p>Describe los pasos para reproducirlo, el navegador y, si es posible, adjunta una captura sin datos privados.</p><a href="https://github.com/AndresYepez23/PRISMA/issues/new" target="_blank" rel="noopener noreferrer">Informar de un error en GitHub <span data-icon="external-link"></span></a></details>',
    '</section>',
    '<div class="settings-help-actions"><a class="settings-action-button" href="./privacy.html#privacidad">Centro de privacidad <span data-icon="arrow-right"></span></a><a class="settings-action-button" href="https://github.com/AndresYepez23/PRISMA/issues" target="_blank" rel="noopener noreferrer">Comunidad y soporte <span data-icon="external-link"></span></a><button type="button" class="settings-action-button" id="settings-help-install"><span data-icon="download"></span> Descargar aplicaciones</button></div>'
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
  const selected = sections[section] ? section : 'general';
  const panel = $('#prisma-settings');
  if (!panel) return;
  panel.dataset.section = selected;
  $('#settings-title').textContent = sections[selected].title;
  $('#settings-description').textContent = sections[selected].description;
  $('#settings-content').innerHTML = sectionContent(selected);
  panel.querySelectorAll('[data-settings-section]').forEach(button => {
    const active = button.dataset.settingsSection === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (selected === 'account') {
    $('#settings-account-name').textContent = $('#profile-menu-title')?.textContent?.trim() || 'Tu espacio en Prisma';
    $('#settings-account-email').textContent = $('#account-menu-state')?.textContent?.trim() || 'Modo invitado';
  }
  paintIcons($('#settings-content'));
  $('#settings-content').scrollTop = 0;
  $('#settings-content').querySelectorAll('[data-theme-choice]').forEach(button => {
    button.addEventListener('click', () => {
      applyThemePreference(button.dataset.themeChoice);
      updateThemeChoices();
    });
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
  $('#settings-signout')?.addEventListener('click', () => $('#account-signout')?.click());
  $('#settings-help-install')?.addEventListener('click', () => document.dispatchEvent(new Event('prisma:request-install')));
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
    if (window.matchMedia('(max-width: 850px)').matches) {
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
  $('#profile-open-settings')?.addEventListener('click', () => openSettings('general'));
  $('#prisma-settings')?.querySelectorAll('[data-settings-section]').forEach(button => {
    button.addEventListener('click', () => setSettingsSection(button.dataset.settingsSection));
  });
  $('#settings-close')?.addEventListener('click', closeSettings);
  $('#settings-back')?.addEventListener('click', closeSettings);
  $('#prisma-settings')?.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link) return;
    const action = event.target.closest('[data-settings-open]');
    if (action) openSettings(action.dataset.settingsOpen);
  });
  document.addEventListener('prisma:theme-changed', updateThemeChoices);
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleSystemTheme = () => {
    if (currentThemePreference() === 'system') applyThemePreference('system');
  };
  media?.addEventListener?.('change', handleSystemTheme);
  media?.addListener?.(handleSystemTheme);
  document.addEventListener('keydown', event => {
    const settings = $('#prisma-settings');
    const isOpen = settings && !settings.classList.contains('hidden');
    if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      if (isOpen) closeSettings();
      else openSettings('general');
      return;
    }
    if (event.key === 'Escape') {
      if (isOpen) { event.preventDefault(); closeSettings(); }
      else closeProfileHelp();
      return;
    }
    if (isOpen && event.key === 'Tab') {
      const focusable = [...settings.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])')]
        .filter(node => node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
