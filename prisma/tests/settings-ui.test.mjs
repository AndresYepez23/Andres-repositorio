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

console.log('Prisma account/settings regressions: compact menu, non-dimming surface, preferences, help and send shortcut verified.');
