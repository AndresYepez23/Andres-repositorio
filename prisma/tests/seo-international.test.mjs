import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { SEO_BASE } from '../seo/config.mjs';

const root=new URL('../',import.meta.url);
const dist=new URL('../dist/',import.meta.url);
const readSource=path=>readFile(new URL(path,root),'utf8');
const readOutput=path=>readFile(new URL(path,dist),'utf8');
const sourcePages=JSON.parse(await readSource('seo/pages.json')).pages;
const pages=JSON.parse(await readSource('seo/pages.en.json')).pages;
const sourceCategories=JSON.parse(await readSource('seo/content-categories.json')).categories;
const sourceSolutions=JSON.parse(await readSource('seo/content-solutions.json')).solutions;
const sourceGuides=JSON.parse(await readSource('seo/content-guides.json')).guides;
const hubs=JSON.parse(await readSource('seo/content-hubs.en.json'));
const sitemap=await readOutput('sitemap.xml');
const urls=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
const decode=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const alt=(html,language)=>html.includes('hreflang="'+language+'"');

test('English catalogue has a one-to-one mapping to every Spanish tool page',()=>{
 assert.equal(pages.length,sourcePages.length);
 assert.equal(hubs.categories.length,sourceCategories.length);
 assert.equal(hubs.solutions.length,sourceSolutions.length);
 assert.equal(hubs.guides.length,sourceGuides.length);
 const mapped=new Map(pages.map(page=>[page.sourceSlug,page]));
 assert.equal(mapped.size,sourcePages.length);
 for(const source of sourcePages){
  const page=mapped.get(source.slug);
  assert.ok(page,'missing English translation for '+source.slug);
  assert.equal(page.tool,source.tool);
  assert.equal(page.format||'',source.format||'');
  assert.ok(page.title&&page.h1&&page.description&&page.intro&&page.details&&page.tip);
  assert.ok(page.steps.length>=3);
  assert.ok(page.faqs.length>=2);
 }
 for(const [key,source] of [['categories',sourceCategories],['solutions',sourceSolutions],['guides',sourceGuides]]){
  const mappedHubs=new Map(hubs[key].map(item=>[item.sourceSlug,item]));
  assert.equal(mappedHubs.size,source.length);
  for(const item of source)assert.ok(mappedHubs.has(item.slug),key+' missing '+item.slug);
 }
});

test('all English tool landings are crawlable, canonical, translated and connected',async()=>{
 const titles=new Set(),descriptions=new Set();
 for(const page of pages){
  const path='en/tools/'+page.englishSlug+'/index.html';
  const html=await readOutput(path);
  assert.match(html,/^<!doctype html>/);
  assert.match(html,/<html lang="en"/);
  assert.equal((html.match(/<h1>/g)||[]).length,1,page.englishSlug);
  assert.match(html,/<meta property="og:locale" content="en_US">/);
  const title=html.match(/<title>(.*?)<\/title>/)?.[1];
  const description=html.match(/<meta name="description" content="(.*?)">/)?.[1];
  assert.ok(title&&title.length<=70,'invalid title '+page.englishSlug);
  assert.ok(description&&description.length<=160,'invalid description '+page.englishSlug);
  assert.ok(!titles.has(title),'duplicate English title '+title);titles.add(title);
  assert.ok(!descriptions.has(description),'duplicate English description '+description);descriptions.add(description);
  const canonical=decode(html.match(/rel="canonical" href="([^"]+)"/)?.[1]||'');
  assert.equal(canonical,SEO_BASE+'/en/tools/'+page.englishSlug+'/');
  assert.ok(alt(html,'es')&&alt(html,'en')&&alt(html,'x-default'));
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema[0].inLanguage,'en');
  assert.equal(schema[0].url,canonical);
  assert.ok(html.includes('href="/en/tools/"'));
  assert.ok(html.includes('class="seo-cta"'));
  assert.ok(html.includes('class="seo-steps"'));
  assert.ok((html.match(/<details>/g)||[]).length>=2);
  assert.ok(urls.includes(canonical),'English tool page missing from sitemap');
  assert.ok((await stat(new URL(path,dist))).size>1800);
 }
});

test('English category, solution and guide hubs have content and working cross-links',async()=>{
 const check=async(path,canonical,type)=>{
  const html=await readOutput(path);
  assert.match(html,/^<!doctype html>/);
  assert.match(html,/<html lang="en"/);
  assert.equal((html.match(/<h1>/g)||[]).length,1,path);
  assert.ok(html.includes('rel="canonical" href="'+canonical+'"'),path);
  assert.ok(alt(html,'es')&&alt(html,'en'));
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema['@type'],type,path);
  assert.equal(schema.inLanguage,'en');
  assert.ok(urls.includes(canonical),'Missing sitemap URL '+canonical);
  assert.ok((await stat(new URL(path,dist))).size>1800);
  return html;
 };
 await check('en/categories/index.html',SEO_BASE+'/en/categories/','CollectionPage');
 await check('en/solutions/index.html',SEO_BASE+'/en/solutions/','CollectionPage');
 await check('en/guides/index.html',SEO_BASE+'/en/guides/','CollectionPage');
 for(const item of hubs.categories){
  const url=SEO_BASE+'/en/categories/'+item.englishSlug+'/';
  const html=await check('en/categories/'+item.englishSlug+'/index.html',url,'CollectionPage');
  assert.ok(html.includes('seo-tool-card'),'category has no tools '+item.sourceSlug);
 }
 for(const item of hubs.solutions){
  const url=SEO_BASE+'/en/solutions/'+item.englishSlug+'/';
  const html=await check('en/solutions/'+item.englishSlug+'/index.html',url,'WebPage');
  assert.ok(html.includes('seo-workflow-steps'),'solution has no workflow '+item.sourceSlug);
  assert.ok(html.includes('seo-tool-card'),'solution has no tool cards '+item.sourceSlug);
 }
 for(const item of hubs.guides){
  const url=SEO_BASE+'/en/guides/'+item.englishSlug+'/';
  const html=await check('en/guides/'+item.englishSlug+'/index.html',url,'HowTo');
  assert.ok(html.includes('seo-article-sections'),'guide has no explanatory content '+item.sourceSlug);
  assert.ok(html.includes('seo-workflow-steps'),'guide has no steps '+item.sourceSlug);
 }
});

test('English app shell and legal page use English metadata and provide a Spanish route',async()=>{
 const app=await readOutput('en/index.html');
 assert.match(app,/<html lang="en"/);
 assert.match(app,/<meta name="prisma-default-language" content="en">/);
 assert.match(app,/<title>Prisma Space — Create, convert and explore<\/title>/);
 assert.match(app,/<link rel="canonical" href="https:\/\/prismaspace\.space\/en\/">/);
 assert.match(app,/<script type="module" src="\.\/src\/i18n\.js"><\/script>/);
 assert.match(app,/<base href="\/">/);
 const legal=await readOutput('en/privacy.html');
 assert.match(legal,/<html lang="en"/);
 assert.match(legal,/<title>Privacy and Terms \| Prisma Space<\/title>/);
 assert.ok(legal.includes('href="/privacy.html"'));
 assert.ok(urls.includes(SEO_BASE+'/en/'));
 assert.ok(urls.includes(SEO_BASE+'/en/privacy.html'));
});

test('bilingual sitemap exposes paired alternates for every published page',async()=>{
 const spanishCount=sourcePages.length+3+sourceCategories.length+sourceSolutions.length+sourceGuides.length+3;
 assert.equal(urls.length,spanishCount*2);
 assert.equal(new Set(urls).size,urls.length);
 assert.match(sitemap,/xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
 assert.match(sitemap,/hreflang="x-default"/);
 for(const page of pages){
  const es=SEO_BASE+'/herramientas/'+page.sourceSlug+'/';
  const en=SEO_BASE+'/en/tools/'+page.englishSlug+'/';
  assert.ok(urls.includes(es));assert.ok(urls.includes(en));
  const html=await readOutput('herramientas/'+page.sourceSlug+'/index.html');
  assert.ok(alt(html,'es')&&alt(html,'en')&&alt(html,'x-default'));
  assert.ok(html.includes('href="'+en+'"'));
 }
 const robots=await readOutput('robots.txt');
 assert.ok(robots.includes('Sitemap: '+SEO_BASE+'/sitemap.xml'));
});
