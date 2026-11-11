import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const core = read('../src/core.js');
const grid = read('../src/core-welcome-grid.js');
const css = read('../styles.css');
const aurora = read('../aurora-system.css');

const findPrism = text => text.match(/<svg class="core-prism-svg core-prism-halftone-svg"[\s\S]*?<\/svg>/)?.[0];
const findHeadline = text => text.match(/<h2>¿Qué necesitas hacer\?[\s\S]*?<\/h2>/)?.[0];

test('initial and runtime welcome have the exact same halftone SVG and headline', () => {
  const first = findPrism(html);
  const runtime = findPrism(core);
  assert.ok(first, 'initial halftone prism is present');
  assert.equal(first, runtime, 'runtime prism geometry matches initial markup');
  assert.equal(findHeadline(html), findHeadline(core), 'the heading stays identical across renderers');
  assert.match(first, /core-prism-halftone-cyan/);
  assert.match(first, /core-prism-halftone-lilac/);
  assert.match(first, /class="core-prism-dotted-edges"/);
  assert.match(first, /stroke-dasharray="\.1 6\.9"/);
  assert.match(first, /core-prism-dot-nodes/);
  assert.match(findHeadline(html), /core-welcome-dotted-word">Prisma\.<\/span>/);
});

test('the dotted welcome is decorative and does not change the layout or semantic heading', () => {
  assert.match(html, /<div class="core-prism-scene" aria-hidden="true">/);
  assert.match(html, /<h2>¿Qué necesitas hacer\?/);
  assert.match(css, /mobile welcome: the vector must never paint over the headline/);
  assert.match(css, /core-prism-scene\{[\s\S]*?aspect-ratio:8 \/ 5/);
  assert.match(css, /core-welcome-gradient-solid/);
  assert.match(css, /core-welcome-dotted-word/);
  assert.match(aurora, /core-welcome-gradient/);
});

test('ambient dot matrix stays mounted behind both empty and active chats', () => {
  assert.match(grid, /export function mountCoreWelcomeGrid\(container\)/);
  assert.match(grid, /layer\.className='core-welcome-ambient'/);
  assert.match(grid, /container\.append\(layer\)/);
  assert.match(core, /syncWelcomeGrid\(\)/);
  assert.match(css, /body\.is-core-view \.main-area > \.core-welcome-ambient/);
  assert.doesNotMatch(grid, /querySelector\(['"]\.core-welcome/);
});

test('ambient matrix fades its own dots near edges without changing its density or size', () => {
  assert.match(grid, /const smoothEdge=value=>/);
  assert.match(grid, /const edgeFade=fadeX\*fadeY/);
  assert.match(grid, /near\*\(dark\?\.72:\.53\)\)\*edgeFade/);
  assert.match(grid, /const dotsDesktop=17,dotsTablet=18,dotsMobile=20/);
  assert.match(grid, /const nominalInterval=precise\?1000\/22:1000\/18/);
  assert.match(grid, /Math\.min\(window\.devicePixelRatio\|\|1,1\.25\)/);
});

test('new effects support reduced motion and the saved accessibility preference', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?core-prism-halftone-svg/);
  assert.match(css, /html\[data-reduce-motion="true"\] body\.is-core-view/);
  assert.match(grid, /if\(!reduced&&precise\)resume\(\)/);
});
