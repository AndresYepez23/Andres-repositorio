import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { SEO_BASE } from '../seo/config.mjs';

const root=new URL('../',import.meta.url);
const dist=new URL('../dist/',import.meta.url);
const readSource=path=>readFile(new URL(path,root),'utf8');
const readOutput=path=>readFile(new URL(path,dist),'utf8');
const sourcePages=JSON.parse(await readSource('seo/pages.json')).pages;
const registrySource=await readSource('src/registry.js');
const toolMode=new Map([...registrySource.matchAll(/\{\s*id:\s*'([^']+)'[^}]*mode:\s*'([^']+)'/g)].map(match=>[match[1],match[2]]));
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
 for(const guide of hubs.guides){
  assert.notEqual(guide.englishSlug,guide.sourceSlug,'guide slug must be English: '+guide.sourceSlug);
  const visible=[guide.title,guide.h1,guide.description,guide.primaryQuery,guide.intro,guide.note,
   ...(guide.sections||[]).flatMap(section=>[section.heading,...section.paragraphs]),
   ...(guide.steps||[]).flatMap(step=>[step.title,step.body]),...(guide.faqs||[]).flat()].join(' ');
  assert.ok(!/[áéíóú¿¡]/i.test(visible),'guide contains untranslated Spanish content: '+guide.sourceSlug);
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
  const mode=toolMode.get(page.tool);
  assert.ok(mode,'missing mode for '+page.tool);
  if(!['local','browser'].includes(mode)) { assert.ok(html.includes('CONNECTED SERVICE'),page.englishSlug); assert.ok(!html.includes('>FREE<'),page.englishSlug); }
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
 assert.ok(app.includes('manifest.en.webmanifest'));
 const manifest=JSON.parse(await readOutput('manifest.en.webmanifest'));
 assert.equal(manifest.lang,'en');
 assert.equal(manifest.start_url,'/en/?source=pwa');
 assert.equal(manifest.id,'/en/');
 assert.match(manifest.name,/Your AI workspace/);
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
 const about=await readOutput('en/about.html');
 const spanishAbout=await readOutput('acerca.html');
 assert.match(about,/<html lang="en"/);
 assert.ok(about.includes('About Prisma Space'));
 assert.ok(spanishAbout.includes('Acerca de Prisma Space'));
 assert.ok(urls.includes(SEO_BASE+'/acerca.html'));
 assert.ok(urls.includes(SEO_BASE+'/en/about.html'));
 assert.ok(legal.includes('Google AdSense'));
 assert.ok(legal.includes('Supabase Auth'));
 const spanishLegal=await readOutput('privacy.html');
 assert.ok(spanishLegal.includes('Google AdSense'));
 assert.ok(spanishLegal.includes('Supabase Auth'));
});

test('bilingual sitemap exposes paired alternates for every published page',async()=>{
 const spanishCount=sourcePages.length+4+sourceCategories.length+sourceSolutions.length+sourceGuides.length+3;
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

test('legal navigation uses complete localized labels and separates the language selector',async()=>{
 const spanish=await readOutput('privacy.html');
 const english=await readOutput('en/privacy.html');
 assert.match(spanish,/<html lang="es"/);
 assert.match(spanish,/← Volver a Prisma Space<\/a>/);
 assert.match(spanish,/<div class="legal-language-options"><a href="\/en\/privacy\.html"[^>]*>Ver esta página en inglés<\/a><\/div>/);
 assert.doesNotMatch(spanish,/<a class="back"[^>]*>[^<]*<\/a>\s*<a[^>]*>English<\/a>/);
 assert.match(english,/← Return to Prisma Space<\/a>/);
 assert.match(english,/<div class="legal-language-options"><a href="\/privacy\.html"[^>]*>View this page in Spanish<\/a><\/div>/);
 assert.match(english,/aria-label="Sections on this page"/);
 assert.doesNotMatch(english,/aria-label="Secciones de esta página"/);
 assert.match(spanish,/rel="canonical" href="https:\/\/prismaspace\.space\/privacy\.html"/);
});

test('SEO navigation labels are in the page language across both catalogues',async()=>{
 const check=async(path,language,label,otherLanguage)=>{
  const html=await readOutput(path);
  assert.match(html,new RegExp('<html lang="'+language+'"'));
  const navigation=html.match(/<nav class="seo-nav"[^>]*>[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok(navigation.includes('class="seo-language-switch"'),path+' missing language selector');
  assert.ok(navigation.includes('>'+label+'</a>'),path+' unlocalized language selector');
  assert.ok(!navigation.includes('>'+otherLanguage+'</a>'),path+' mixed language switch label');
 };
 await check('herramientas/index.html','es','Cambiar a inglés','Switch to Spanish');
 await check('en/tools/index.html','en','Switch to Spanish','Cambiar a inglés');
 for(const page of pages) {
  await check('herramientas/'+page.sourceSlug+'/index.html','es','Cambiar a inglés','Switch to Spanish');
  await check('en/tools/'+page.englishSlug+'/index.html','en','Switch to Spanish','Cambiar a inglés');
 }
 for (const [esDirectory,enDirectory,esItems,enItems] of [
  ['categorias','en/categories',sourceCategories,hubs.categories],
  ['soluciones','en/solutions',sourceSolutions,hubs.solutions],
  ['guias','en/guides',sourceGuides,hubs.guides]
 ]) {
  await check(esDirectory+'/index.html','es','Cambiar a inglés','Switch to Spanish');
  await check(enDirectory+'/index.html','en','Switch to Spanish','Cambiar a inglés');
  const englishBySource=new Map(enItems.map(item=>[item.sourceSlug,item]));
  for(const item of esItems) {
   const english=englishBySource.get(item.slug);
   assert.ok(english,'Missing translated content hub: '+item.slug);
   await check(esDirectory+'/'+item.slug+'/index.html','es','Cambiar a inglés','Switch to Spanish');
   await check(enDirectory+'/'+english.englishSlug+'/index.html','en','Switch to Spanish','Cambiar a inglés');
  }
 }
});
