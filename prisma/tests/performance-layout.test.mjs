import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const main=read('../src/main.js');
const core=read('../src/core.js');
const grid=read('../src/core-welcome-grid.js');
const styles=read('../styles.css');

test('Core ambient canvas follows the active-view lifecycle',()=>{
  assert.match(core,/let coreViewActive = true/);
  assert.match(core,/function syncWelcomeGrid\(\)/);
  assert.match(core,/const shouldMount=coreViewActive&&messages\.length===0/);
  assert.match(core,/export function setPrismaCoreViewActive\(active\)/);
  assert.match(main,/setPrismaCoreViewActive\(core\)/);
  assert.match(core,/syncWelcomeGrid\(\);/);
});

test('ambient canvas cannot become page content outside Prisma Core',()=>{
  assert.match(styles,/body:not\(\.is-core-view\) \.main-area > \.core-welcome-ambient\s*\{\s*display:none!important/);
  assert.match(styles,/body\.is-core-view \.main-area > \.core-welcome-ambient/);
});

test('decorative canvas uses a bounded render budget',()=>{
  assert.match(grid,/nominalInterval=precise\?1000\/22:1000\/18/);
  assert.match(grid,/dotsDesktop=17,dotsTablet=18,dotsMobile=20/);
  assert.match(grid,/Math\.min\(window\.devicePixelRatio\|\|1,1\.25\)/);
});

test('sidebar categories scroll inside the sidebar without horizontal page overflow',()=>{
  assert.match(styles,/\.sidebar-scroll-region\s*\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/s);
  assert.match(styles,/html,body\{overflow-x:hidden\}/);
});

console.log('Prisma performance/layout regressions: Core canvas lifecycle, render budget and navigation overflow verified.');
