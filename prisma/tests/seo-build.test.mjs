import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const dist=new URL('../dist/',import.meta.url);
const {pages}=JSON.parse(await readFile(new URL('seo/pages.json',root),'utf8'));

test('40 pages configured with unique slugs and real tool IDs',async()=>{
  assert.equal(pages.length,40);
  assert.equal(new Set(pages.map(page=>page.slug)).size,40);
  const firstBatchTools=new Set(pages.slice(0,20).map(page=>page.tool));
  const secondBatchTools=pages.slice(20).map(page=>page.tool);
  assert.equal(new Set(secondBatchTools).size,20,'second batch must not repeat a tool');
  assert.ok(secondBatchTools.every(tool=>!firstBatchTools.has(tool)),'second batch must not reuse first-batch tools');
  const registry=await import('../src/registry.js');
  for(const page of pages){
    const tool=registry.tools.find(t=>t.id===page.tool);
    assert.ok(tool,'unknown tool: '+page.tool);
    assert.ok(['ready','beta'].includes(tool.status),'tool unavailable: '+page.tool);
  }
});

test('40 pre-rendered pages have unique titles, canonical, guidance, CTA and FAQ',async()=>{
  const titles=new Set();
  for(const page of pages){
    const path=new URL('herramientas/'+page.slug+'/index.html',dist);
    const markup=await readFile(path,'utf8');
    assert.match(markup,/<html lang="es"/);
    assert.match(markup,/<meta name="description"/);
    assert.match(markup,/<h1>/);
    assert.match(markup,/<script type="application\/ld\+json">/);
    assert.match(markup,/<ol class="seo-steps">/);
    assert.match(markup,/<details>/);
    assert.ok(markup.includes('href="https://prismaspace.pages.dev/herramientas/'+page.slug+'/"'),page.slug+' canonical');
    assert.ok(markup.includes('tool='+page.tool),page.slug+' tool link');
    assert.ok(!markup.includes('Prisma Space — Crea, convierte y experimenta'),page.slug+' generic title');
    const match=markup.match(/<title>(.*?)<\/title>/);
    assert.ok(match);
    assert.ok(!titles.has(match[1]),'duplicate title');
    titles.add(match[1]);
    assert.ok((await stat(path)).size>2500,page.slug+' incomplete HTML');
  }
});

test('directory and sitemap expose all 40 URLs and robots advertises sitemap',async()=>{
  const listing=await readFile(new URL('herramientas/index.html',dist),'utf8');
  const sitemap=await readFile(new URL('sitemap.xml',dist),'utf8');
  const robots=await readFile(new URL('robots.txt',dist),'utf8');
  for(const page of pages){
    assert.ok(listing.includes('href="/herramientas/'+page.slug+'/"'),page.slug+' missing from listing');
    assert.ok(sitemap.includes('https://prismaspace.pages.dev/herramientas/'+page.slug+'/'),page.slug+' missing from sitemap');
  }
  assert.match(robots,/Sitemap: https:\/\/prismaspace\.pages\.dev\/sitemap\.xml/);
  assert.match(listing,/<link rel="canonical"/);
});
