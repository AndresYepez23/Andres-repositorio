import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('../styles.css');
const html = read('../index.html');
const core = read('../src/core.js');

const mobileWelcomeFix = styles.slice(styles.indexOf('/* Prisma Core · mobile welcome:'));

test('welcome SVG stays in normal flow above the heading in both markup and runtime', () => {
  for (const source of [html, core]) {
    const scene = source.indexOf('class="core-prism-scene"');
    const heading = source.indexOf('<h2>¿Qué necesitas hacer?', scene);
    assert.ok(scene >= 0, 'welcome scene must exist');
    assert.ok(heading > scene, 'heading must follow the scene');
  }
});

test('mobile and coarse-pointer welcome reserve a non-shrinking aspect-ratio box', () => {
  assert.match(mobileWelcomeFix, /@media \(max-width:850px\), \(pointer:coarse\) and \(max-width:1180px\)/);
  assert.match(mobileWelcomeFix, /body\.is-core-view #core-messages\.is-empty \.core-prism-scene\{/);
  assert.match(mobileWelcomeFix, /flex:0 0 auto!important/);
  assert.match(mobileWelcomeFix, /height:auto!important/);
  assert.match(mobileWelcomeFix, /aspect-ratio:8 \/ 5/);
  assert.match(mobileWelcomeFix, /margin:8px auto clamp\(17px,2\.5dvh,23px\)!important/);
});

test('welcome SVG is clipped rather than painted across text when the viewport contracts', () => {
  assert.match(mobileWelcomeFix, /\.core-prism-svg\{[\s\S]*?overflow:hidden!important/);
  assert.match(mobileWelcomeFix, /\.core-welcome h2\{[\s\S]*?margin:0 auto 10px!important/);
  assert.match(mobileWelcomeFix, /max-height:740px/);
  assert.match(mobileWelcomeFix, /max-height:590px/);
  assert.doesNotMatch(mobileWelcomeFix, /overflow:visible/);
});
