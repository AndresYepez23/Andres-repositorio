import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../aurora-system.css');
const html = read('../index.html');
const layoutCss = read('../styles.css');

const composerFix = css.slice(css.indexOf('/* iOS / PWA composer: one compact horizontal row'));
const mobileFix = composerFix.slice(composerFix.indexOf('@media(max-width:620px)'), composerFix.indexOf('@media(max-width:355px)'));

test('mobile Prisma Core composer stays a single row including attachment and actions', () => {
 assert.ok(composerFix.startsWith('/* iOS / PWA composer: one compact horizontal row'), 'single-row override exists');
 assert.match(mobileFix, /\.core-compose-surface\s*\{[\s\S]*?display:flex!important;[\s\S]*?flex-direction:row!important;[\s\S]*?flex-wrap:nowrap!important/);
 assert.doesNotMatch(mobileFix, /display:grid!important|grid-template-(?:rows|columns)|grid-row|grid-column/);
});

test('text area can shrink to share width without a second controls row', () => {
 assert.match(mobileFix, /\.core-compose-surface #core-input\s*\{[\s\S]*?flex:1 1 0%;[\s\S]*?width:0!important;[\s\S]*?min-width:0!important/);
 assert.match(mobileFix, /\.core-compose-surface \.core-composer-footer\s*\{[\s\S]*?flex:0 0 auto;[\s\S]*?width:auto!important/);
 assert.match(mobileFix, /\.core-composer\[aria-busy="true"\] \.core-compose-surface\s*\{[\s\S]*?min-height:50px/);
});

test('all composer controls remain in their existing DOM order and keep their IDs', () => {
 const start = html.indexOf('<div class="core-compose-surface">');
 const end = html.indexOf('</details>', start);
 assert.ok(start >= 0 && end > start);
 const composer = html.slice(start, html.indexOf('</div>\n                </div>', start));
 for(const id of ['core-file-button','core-input','core-model-panel','core-dictate','core-talk','core-send']) {
   assert.ok(composer.includes('id="'+id+'"'), id+' remains mounted');
 }
 assert.ok(composer.indexOf('id="core-file-button"') < composer.indexOf('id="core-input"'));
 assert.ok(composer.indexOf('id="core-input"') < composer.indexOf('class="core-composer-footer"'));
});


test('new and existing Core conversations keep one full-width chat and composer layout', () => {
 const start = layoutCss.lastIndexOf('/* Prisma Core · stable full-width contract for empty and populated chats.');
 assert.ok(start >= 0, 'final full-width layout contract exists');
 const rules = layoutCss.slice(start);
 assert.ok(rules.includes('body.is-core-view #core-workspace{'));
 assert.ok(rules.includes('body.is-core-view .core-chat-column{'));
 assert.ok(rules.includes('body.is-core-view #core-composer{'));
 assert.ok(rules.includes('body.is-core-view .core-compose-surface{'));
 assert.ok(rules.includes('display:flex!important;'));
 assert.ok(rules.includes('align-items:stretch!important;'));
 assert.ok(rules.includes('width:100%!important;'));
 assert.ok(rules.includes('max-width:none!important;'));
 assert.doesNotMatch(rules, /has-conversation/, 'the width contract must not depend on chat age or message state');
});
