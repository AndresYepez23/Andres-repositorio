import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const styles = read('../styles.css');
const main = read('../src/main.js');
const core = read('../src/core.js');
const settings = read('../src/prisma-settings.js');
const experience = read('../src/prisma-experience.js');
const account = read('../src/prisma-account.js');

test('profile menu stays compact and does not dim the workspace', () => {
  assert.match(html, /id="profile-menu"/);
  assert.match(html, /id="profile-open-settings"/);
  assert.match(html, /id="profile-open-help"/);
  assert.match(html, /id="profile-help-menu"/);
  assert.match(styles, /body\.profile-open::before\{content:none!important;display:none!important\}/);
  assert.match(styles, /\.profile-menu\{[\s\S]*?width:min\(316px/);
});

test('settings panel exposes real sections and help destinations', () => {
  for (const section of ['general', 'personalization', 'account', 'privacy', 'shortcuts', 'help', 'whatsNew']) {
    assert.match(html, new RegExp('data-settings-section="' + section + '"'));
    assert.match(settings, new RegExp("case '" + section + "'"));
  }
  assert.match(html, /id="prisma-settings"/);
  assert.match(html, /privacy\.html#condiciones/);
  assert.match(html, /github\.com\/AndresYepez23\/PRISMA\/issues\/new/);
  assert.match(experience, /initPrismaSettings\(\)/);
});

test('appearance preferences are persisted and applied to the interface', () => {
  assert.match(settings, /localStorage\.setItem\('prisma-theme', selected\)/);
  assert.match(settings, /data-theme-choice="system"/);
  assert.match(settings, /prisma-compact-ui/);
  assert.match(settings, /prisma-reduce-motion/);
  assert.match(styles, /body\.prisma-compact-ui \.core-messages/);
  assert.match(styles, /html\[data-reduce-motion="true"\]/);
});

test('message send shortcut is configurable without changing Shift+Enter behavior', () => {
  assert.match(settings, /localStorage\.setItem\(SETTINGS_KEY/);
  assert.match(core, /localStorage\.getItem\('prisma-send-shortcut'\)/);
  assert.match(core, /event\.key!=='Enter'\|\|event\.shiftKey/);
  assert.match(main, /if\(!event\.target\.closest\?\.\('#clear-local-data'\)\)return/);
});


test('mobile settings have a safe-area toolbar and a true grouped home', () => {
  assert.match(html, /id="settings-mobile-back"/);
  assert.match(html, /id="settings-mobile-close"/);
  assert.match(html, /id="settings-mobile-title"/);
  assert.match(settings, /function mobileHomeContent\(\)/);
  assert.match(settings, /settings-home-group/);
  assert.match(settings, /setSettingsSection\('home'\)/);
  assert.match(settings, /isMobileSettings\(\)/);
  assert.match(styles, /#prisma-settings \.prisma-settings-sidebar\{display:none!important\}/);
  assert.match(styles, /#prisma-settings \.settings-mobile-toolbar\{/);
  assert.match(styles, /body\.is-prisma-ios\.is-prisma-standalone #prisma-settings \.settings-mobile-toolbar/);
  assert.match(styles, /env\(safe-area-inset-top,0px\)/);
  assert.match(styles, /#prisma-settings \.settings-content\{/);
});

test('mobile back moves to settings home and close exits the dialog', () => {
  assert.match(settings, /#settings-mobile-back'\)\?\.addEventListener\('click'/);
  assert.match(settings, /#settings-mobile-close'\)\?\.addEventListener\('click', closeSettings\)/);
  assert.match(settings, /else setSettingsSection\('home'\)/);
  assert.match(settings, /closeSettings\(\)/);
});

test('help links align consistently and preserve real destinations', () => {
  assert.match(settings, /settings-help-links/);
  assert.match(settings, /settings-help-link-icon/);
  assert.match(settings, /settings-help-link-chevron/);
  assert.match(settings, /https:\/\/github\.com\/AndresYepez23\/PRISMA\/issues\/new/);
  assert.match(settings, /id="settings-help-install"/);
  assert.match(styles, /#prisma-settings \.settings-help-link\{/);
});

test('starting screen preference is stored and restored at startup', () => {
  assert.match(settings, /localStorage\.setItem\('prisma-start-view'/);
  assert.match(main, /localStorage\.getItem\('prisma-start-view'\)==='explore'/);
});


test('guests see visible entry points once session resolution identifies them as guests', () => {
  assert.match(html, /class="profile-guest-actions hidden" id="profile-guest-actions"/);
  assert.match(html, /id="profile-guest-login">Iniciar sesión</);
  assert.match(html, /id="profile-guest-signup">Crear cuenta gratis</);
  assert.match(account, /#profile-guest-actions'\)\?\.classList\.toggle\('hidden',Boolean\(user\?\.id\)\)/);
  assert.match(styles, /\.profile-menu \.profile-guest-actions\.hidden\{display:none!important\}/);
  assert.match(styles, /\.profile-menu \.profile-guest-login\{/);
});

test('guest buttons open the requested authentication screen without an extra intro step', () => {
  assert.match(experience, /#profile-guest-login'\)\?\.addEventListener/);
  assert.match(experience, /openPrismaAuth\('login'\)/);
  assert.match(experience, /#profile-guest-signup'\)\?\.addEventListener/);
  assert.match(experience, /openPrismaAuth\('signup'\)/);
  assert.match(account, /const directMode=mode==='login'\|\|mode==='signup'/);
  assert.match(account, /showScreen\(directMode\?'email':'intro'\)/);
  assert.match(account, /updateTabs\(\)/);
  assert.match(account, /export function openPrismaAuth\(mode='intro'\)\{openAccount\(mode\);\}/);
});


test('login and signup tabs both show a working Google entry point', () => {
  const emailScreen = html.split('id="auth-email-screen"')[1]?.split('id="auth-phone-screen"')[0] || '';
  assert.match(emailScreen, /id="auth-tab-login"/);
  assert.match(emailScreen, /id="auth-tab-signup"/);
  assert.match(emailScreen, /id="auth-google-email"/);
  assert.match(emailScreen, /Continuar con Google/);
  assert.ok(emailScreen.indexOf('id="auth-google-email"') < emailScreen.indexOf('id="auth-form"'));
  assert.match(account, /#auth-google'\),\$\('#auth-google-email'\)/);
  assert.match(account, /for\(const selector of \['#auth-google','#auth-google-email'\]\)/);
  assert.match(account, /signInProvider\('google'\)/);
  assert.match(account, /api\.auth\.signInWithOAuth\(\{/);
  assert.match(styles, /#auth-modal \.auth-email-provider button/);
});

test('registration does not require avatar selection, but profile editing retains it', () => {
  assert.doesNotMatch(html, /id="auth-signup-avatar-choices"/);
  assert.doesNotMatch(html, /id="auth-signup-personalization"/);
  assert.doesNotMatch(account, /signupAvatarChoice/);
  assert.match(html, /id="auth-display-name"/);
  assert.match(html, /id="auth-password-confirm"/);
  assert.match(account, /data:\{full_name:chosenName\}/);
  assert.match(html, /id="auth-profile-avatar-choices"/);
  assert.match(account, /renderAvatarChoices\('auth-profile-avatar-choices'/);
  assert.match(account, /api\.auth\.updateUser\(\{data:\{prisma_avatar:avatar\}\}\)/);
});
console.log('Prisma account/settings regressions: compact menu, non-dimming surface, preferences, help and send shortcut verified.');
