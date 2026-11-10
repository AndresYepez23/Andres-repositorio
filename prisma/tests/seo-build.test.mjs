import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { validatePages, toolUrl } from '../seo/generate.mjs';
import { SEO_BASE, FORMAT_PRESETS } from '../seo/config.mjs';
import { tools } from '../src/registry.js';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const {pages}=JSON.parse(await read('seo/pages.json'));
const baseline=JSON.parse(await read('seo/baseline.json'));
const main=await read('src/main.js');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');

test('catalogue scales without a fixed batch size and preserves original pages',()=>{
 assert.doesNotThrow(()=>validatePages(pages));
 assert.doesNotThrow(()=>validatePages(pages.slice(0,1)));
 for(const previous of baseline){
  const current={...pages.find(p=>p.slug===previous.slug)};delete current.format;
  assert.deepEqual(current,previous,'existing page changed: '+previous.slug);
 }
 for(const size of [50,70,100,200]){
  const synthetic=Array.from({length:size},(_,i)=>({...pages[0],slug:'test-'+i,title:'Title '+i,h1:'Heading '+i,description:'Description '+i}));
  assert.doesNotThrow(()=>validatePages(synthetic));
 }
});
test('invalid catalogue entries fail before writing HTML',()=>{
 const mutate=change=>[{...pages[0],...change}];
 for(const bad of [mutate({tool:'missing'}),mutate({tool:'pdf-protect'}),mutate({slug:'../escape'}),mutate({steps:[]}),mutate({faqs:[['question']]}),mutate({format:'mp3'}),mutate({params:{output:'pdf'}}),[pages[0],pages[0]]]) assert.throws(()=>validatePages(bad));
});
test('every preset matches the app allowlist and only supported URL fields are emitted',()=>{
 const actual=JSON.parse(main.match(/const allowed=(\{[^;]+\});/)[1].replaceAll("'",'"'));
 assert.deepEqual(FORMAT_PRESETS,actual);
 for(const p of pages){
  const url=new URL(toolUrl(p),SEO_BASE);
  assert.equal(url.searchParams.get('tool'),p.tool);
  assert.deepEqual([...url.searchParams.keys()],p.format?['tool','format']:['tool']);
  if(p.format)assert.ok(actual[p.tool]?.includes(p.format));
 }
 assert.match(main,/openTool\(target\)/);
});
test('rendered pages have one H1, unique metadata, valid JSON-LD and real CTA',async()=>{
 const titles=new Set(),descriptions=new Set(),incoming=new Map(pages.map(p=>[p.slug,0]));
 for(const p of pages){
  const path=new URL('herramientas/'+p.slug+'/index.html',dist),html=await readFile(path,'utf8');
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.match(html,/^<!doctype html>/);
  assert.match(html,/<html lang="es"/);
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/<ol class="seo-steps">/);
  assert.ok((html.match(/<details>/g)||[]).length>=2);
  assert.ok(!/\b(?:undefined|NaN)\b/.test(html),p.slug);
  const title=html.match(/<title>(.*?)<\/title>/)[1],description=html.match(/<meta name="description" content="(.*?)">/)[1];
  assert.ok(!titles.has(title));titles.add(title);assert.ok(!descriptions.has(description));descriptions.add(description);
  const canonical=decode(html.match(/rel="canonical" href="([^"]+)"/)[1]);
  assert.equal(canonical,SEO_BASE+'/herramientas/'+p.slug+'/');
  assert.ok(html.includes('property="og:url" content="'+canonical+'"'));
  const schemas=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schemas[0]['@type'],'WebApplication');assert.equal(schemas[0].url,canonical);
  assert.equal(schemas[1]['@type'],'BreadcrumbList');assert.equal(schemas[1].itemListElement.at(-1).item,canonical);
  const cta=decode(html.match(/class="seo-cta" href="([^"]+)"/)[1]);assert.equal(cta,toolUrl(p));
  for(const match of html.matchAll(/class="seo-related-card" href="\/herramientas\/([^/]+)\/"/g)){
   assert.ok(incoming.has(match[1]),'broken related link');assert.notEqual(match[1],p.slug);incoming.set(match[1],incoming.get(match[1])+1);
  }
  assert.ok((await stat(path)).size>2500);
 }
 for(const [slug,count] of incoming)assert.ok(count>0,slug+' has no contextual incoming link');
});
test('directory categories and sitemap expose exactly the current URLs',async()=>{
 const listing=await readFile(new URL('herramientas/index.html',dist),'utf8');
 const sitemap=await readFile(new URL('sitemap.xml',dist),'utf8');
 const robots=await readFile(new URL('robots.txt',dist),'utf8');
 const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>decode(m[1]));
 assert.equal(urls.length,pages.length+3);assert.equal(new Set(urls).size,urls.length);
 for(const p of pages){
  assert.ok(listing.includes('href="/herramientas/'+p.slug+'/"'));assert.ok(urls.includes(SEO_BASE+'/herramientas/'+p.slug+'/'));
  const category=tools.find(t=>t.id===p.tool).category;
  assert.ok(listing.includes('id="'+category+'"'));assert.ok(listing.includes('href="#'+category+'"'));
 }
 assert.ok(listing.includes('Explora '+pages.length+' herramientas'));
 assert.ok(robots.includes('Sitemap: '+SEO_BASE+'/sitemap.xml'));
});
