import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tools, categories } from '../src/registry.js';

import { SEO_BASE as BASE, FORMAT_PRESETS } from './config.mjs';
const GROUPS = Object.fromEntries(categories.filter(c => c.id !== 'all').map((c,i) => [c.id, {name:c.name, order:i}]));
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeJson = object => JSON.stringify(object).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const urlFor = slug => BASE + '/herramientas/' + encodeURIComponent(slug) + '/';
const categoryFor = tool => GROUPS[tool.category] || { name: 'Herramientas', order: 5 };
export function toolUrl(page) {
  const search = new URLSearchParams({ tool: page.tool });
  if (page.format) search.set('format', page.format);
  return '/?' + search.toString();
}
function head(title, description, url, schema) {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="theme-color" content="#0e121d">',
    '<meta name="description" content="' + esc(description) + '">',
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta name="application-name" content="Prisma Space">',
    '<title>' + esc(title) + '</title>',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Prisma Space">',
    '<meta property="og:locale" content="es_ES">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(description) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta name="twitter:card" content="summary">',
    '<link rel="icon" href="/assets/prisma-mark.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/assets/prisma-192.png">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;family=Manrope:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="/aurora-system.css">',
    '<link rel="stylesheet" href="/seo.css">',
    '<script>try { const saved = localStorage.getItem("prisma-theme"); if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved; } catch {}</script>',
    '<script type="application/ld+json">' + safeJson(schema) + '</script>'
  ].join('\n');
}
function header() {
  return [
    '<header class="seo-header"><div class="seo-header-inner">',
    '<a class="seo-brand" href="/" aria-label="Volver a Prisma Space"><img src="/assets/prisma-mark.svg" alt="" width="36" height="36"><span><strong>Prisma Space</strong><small>ECOSISTEMA DIGITAL</small></span></a>',
    '<nav class="seo-nav" aria-label="Navegación principal"><a href="/herramientas/">Herramientas gratis</a><a href="/">Prisma Core</a><button id="seo-theme" type="button" aria-label="Cambiar tema">◐ <span>Tema</span></button></nav>',
    '</div></header>'
  ].join('\n');
}
function footer() {
  return [
    '<footer class="seo-footer"><div><a href="/">Prisma Space</a><span>Herramientas con intención.</span></div><nav aria-label="Enlaces del pie de página"><a href="/herramientas/">Todas las herramientas</a><a href="/privacy.html#privacidad">Privacidad y uso</a></nav></footer>',
    '<script>(function(){ const button = document.getElementById("seo-theme"); if(!button) return; button.addEventListener("click", function(){ const next = document.documentElement.dataset.theme === "light" ? "dark" : "light"; document.documentElement.dataset.theme = next; try {localStorage.setItem("prisma-theme", next);}catch{} const meta=document.querySelector("meta[name=theme-color]");if(meta)meta.content=next==="light"?"#f3f7fc":"#0e121d"; }); })();</script>'
  ].join('\n');
}
function markup(title, description, url, schema, main) {
  return ['<!doctype html>', '<html lang="es" data-theme="dark">', '<head>', head(title, description, url, schema), '</head>', '<body class="seo-page">', header(), main, footer(), '</body>', '</html>', ''].join('\n');
}
function relatedCards(page, pages, toolMap) {
  const family = p => ({office:'data',web:'dev'}[toolMap.get(p.tool).category] || toolMap.get(p.tool).category);
  const category = family(page);
  const peers = pages.filter(p => family(p) === category);
  const index = peers.findIndex(p => p.slug === page.slug);
  const ordered = [...peers.slice(index+1), ...peers.slice(0,index), ...pages.filter(p => family(p) !== category)];
  return ordered.slice(0,4).map(p => '<a class="seo-related-card" href="/herramientas/' + esc(p.slug) + '/"><strong>' + esc(p.h1) + '</strong><small>' + esc(categoryFor(toolMap.get(p.tool)).name) + '</small><span aria-hidden="true">↗</span></a>').join('\n');
}
function landing(page, pages, toolMap) {
  const tool = toolMap.get(page.tool);
  const url = urlFor(page.slug);
  const beta = tool.status === 'beta';
  const schema = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: page.h1 + ' | Prisma Space', description: page.description, url, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', inLanguage: 'es', ...(['local','browser'].includes(tool.mode) ? {isAccessibleForFree:true, offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}} : {}) },
    { '@context': 'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
      { '@type':'ListItem', position:1, name:'Prisma Space', item:BASE+'/' },
      { '@type':'ListItem', position:2, name:'Herramientas', item:BASE+'/herramientas/' },
      { '@type':'ListItem', position:3, name:page.h1, item:url }
    ] }
  ];
  const steps = page.steps.map(step => '<li><span>' + esc(step) + '</span></li>').join('\n');
  const faqs = page.faqs.map(pair => '<details><summary>' + esc(pair[0]) + '</summary><p>' + esc(pair[1]) + '</p></details>').join('\n');
  const body = [
    '<main class="seo-main">',
    '<nav class="seo-breadcrumb" aria-label="Ruta de navegación"><a href="/">Inicio</a><span>/</span><a href="/herramientas/">Herramientas</a><span>/</span><a href="/herramientas/#' + esc(tool.category) + '">' + esc(categoryFor(tool).name) + '</a><span>/</span><span aria-current="page">' + esc(page.h1) + '</span></nav>',
    '<section class="seo-hero"><div class="seo-hero-copy">',
    '<div class="seo-eyebrow"><i></i>' + esc(categoryFor(tool).name) + ' · ' + (['local','browser'].includes(tool.mode)?'Procesamiento local':'Servicio conectado') + ' · ' + (beta ? 'Beta' : 'Disponible') + '</div>',
    '<h1>' + esc(page.h1) + '</h1>',
    '<p class="seo-lead">' + esc(page.description) + '</p>',
    '<div class="seo-actions"><a class="seo-cta" href="' + esc(toolUrl(page)) + '">Abrir herramienta gratis <span aria-hidden="true">↗</span></a><a class="seo-subtle" href="#como-funciona">Cómo funciona ↓</a></div>',
    '<p class="seo-privacy"><span aria-hidden="true">◇</span> ' + esc(page.privacyNote || (['local','browser'].includes(tool.mode) ? 'Procesamiento en el navegador · Sin registro' : 'Consulta las condiciones de uso de la herramienta')) + '</p></div>',
    '<div class="seo-preview" aria-hidden="true"><div class="seo-preview-orb"></div><div class="seo-preview-label">PRISMA SPACE / ' + esc(page.slug.toUpperCase().replaceAll('-', ' ')) + '</div>',
    '<div class="seo-preview-content"><div class="seo-preview-symbol"><img src="/assets/prisma-mark.svg" width="46" height="46" alt=""></div><strong>' + esc(tool.name) + '</strong><span>' + (beta ? 'Función en beta' : 'Lista para usar') + '</span></div>',
    '<div class="seo-preview-foot"><span>Una tarea, una solución</span><span>GRATIS</span></div></div></section>',
    '<div class="seo-content-grid" id="como-funciona">',
    '<section class="seo-panel"><div class="seo-section-label">QUÉ PUEDES HACER</div><h2>' + esc(page.h1) + ': lo que necesitas saber</h2><p>' + esc(page.intro) + '</p><p>' + esc(page.details) + '</p></section>',
    '<section class="seo-panel"><div class="seo-section-label">PASO A PASO</div><h2>Cómo utilizar esta herramienta</h2><ol class="seo-steps">' + steps + '</ol><a class="seo-inline-link" href="' + esc(toolUrl(page)) + '">Abrir ' + esc(tool.name) + ' ↗</a></section>',
    '</div>',
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Antes de empezar</strong><p>' + esc(page.tip) + '</p>' + (beta ? '<small>Esta función figura como beta en el catálogo de Prisma Space.</small>' : '') + '</div></aside>',
    '<section class="seo-faq" aria-labelledby="faq-title"><div class="seo-section-label">PREGUNTAS FRECUENTES</div><h2 id="faq-title">Dudas habituales</h2>' + faqs + '</section>',
    '<section class="seo-related" aria-labelledby="related-title"><div class="seo-related-heading"><div><div class="seo-section-label">TAMBIÉN TE PUEDE SERVIR</div><h2 id="related-title">Más herramientas gratuitas</h2></div><a href="/herramientas/">Ver todas ↗</a></div><div class="seo-related-grid">' + relatedCards(page,pages,toolMap) + '</div></section>',
    '</main>'
  ].join('\n');
  return markup(page.title+' | Prisma Space',page.description,url,schema,body);
}
function directory(pages,toolMap) {
  const url=BASE+'/herramientas/';
  const title=pages.length+' herramientas y operaciones online | Prisma Space';
  const description='Explora '+pages.length+' herramientas y operaciones de Prisma Space para PDF, imágenes, vídeo, audio, IA, estudio y productividad. Abre cada función desde el navegador.';
  const categories=[...new Set(pages.map(p=>toolMap.get(p.tool).category))].sort((a,b)=>categoryFor({category:a}).order-categoryFor({category:b}).order);
  const tags=categories.map(c=>'<a href="#'+esc(c)+'">'+esc(categoryFor({category:c}).name)+' ↓</a>').join('');
  const sections=categories.map(c=>{
    const links=pages.filter(p=>toolMap.get(p.tool).category===c).map(p=>'<a class="seo-directory-card" href="/herramientas/'+esc(p.slug)+'/"><strong>'+esc(p.h1)+'</strong><span>'+esc(p.description)+'</span><small>'+(toolMap.get(p.tool).status==='beta'?'En beta · ':'')+'Abrir gratis ↗</small></a>').join('\n');
    return '<section class="seo-category" id="'+esc(c)+'"><div class="seo-section-label">EXPLORA POR CATEGORÍA</div><h2>'+esc(categoryFor({category:c}).name)+'</h2><div class="seo-directory-grid">'+links+'</div></section>';
  }).join('\n');
  const body=[
    '<main class="seo-main"><nav class="seo-breadcrumb" aria-label="Ruta de navegación"><a href="/">Inicio</a><span>/</span><span aria-current="page">Herramientas gratuitas</span></nav>',
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>GRATIS · PRISMA SPACE</div><h1>Herramientas online gratuitas para resolver tareas al instante</h1>',
    '<p>Convierte documentos, edita imágenes, procesa vídeo y audio, crea contenido y resuelve tareas de estudio desde Prisma Space. Explora '+pages.length+' herramientas y operaciones y abre la que necesitas en un clic.</p><div class="seo-tags">'+tags+'</div></section>',
    sections,
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Disponibilidad y privacidad</strong><p>Las funciones beta pueden tener limitaciones. No se promocionan aquí herramientas todavía en preparación. Revisa las indicaciones de privacidad y funcionamiento de cada operación.</p></div></aside>',
    '</main>'
  ].join('\n');
  return markup(title,description,url,{ '@context':'https://schema.org', '@type':'CollectionPage', name:title, description, url, inLanguage:'es' },body);
}
export function validatePages(pages) {
  if (!Array.isArray(pages) || !pages.length) throw Error('SEO: catálogo vacío');
  const toolMap=new Map(tools.map(t=>[t.id,t]));
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  for(const key of ['slug','title','h1','description']) {
    if(new Set(pages.map(p=>normalize(p[key]))).size!==pages.length) throw Error('SEO: duplicado en '+key);
  }
  for(const page of pages) {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) throw Error('SEO: slug inválido');
    if(!['ready','beta'].includes(toolMap.get(page.tool)?.status)) throw Error('SEO: herramienta no disponible: '+page.tool);
    for(const key of ['title','h1','description','intro','details','tip']) if(typeof page[key]!=='string'||!page[key].trim()) throw Error('SEO: contenido incompleto: '+page.slug+' '+key);
    if(!Array.isArray(page.steps)||page.steps.length<3||page.steps.some(s=>typeof s!=='string'||!s.trim())) throw Error('SEO: pasos incompletos');
    if(!Array.isArray(page.faqs)||page.faqs.length<2||page.faqs.some(p=>!Array.isArray(p)||p.length!==2||p.some(s=>typeof s!=='string'||!s.trim()))) throw Error('SEO: FAQ incompleta');
    if(page.format&&!FORMAT_PRESETS[page.tool]?.includes(page.format)) throw Error('SEO: formato de apertura no admitido');
    if(page.params) throw Error('SEO: parámetros de apertura no admitidos');
  }
  return toolMap;
}

export async function generateSeoPages(output) {
  const {pages}=JSON.parse(await readFile(new URL('./pages.json',import.meta.url),'utf8'));
  const toolMap=validatePages(pages);
  for (const page of pages) {
    const tool=toolMap.get(page.tool);
    if (!tool||!['ready','beta'].includes(tool.status)) throw Error('SEO: herramienta no disponible: '+page.tool);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) throw Error('SEO: slug inválido: '+page.slug);

    const folder=new URL('herramientas/'+page.slug+'/',output);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),landing(page,pages,toolMap),'utf8');
  }
  const listing=new URL('herramientas/',output);
  await mkdir(listing,{recursive:true});
  await writeFile(new URL('index.html',listing),directory(pages,toolMap),'utf8');
  const urls=[BASE+'/', BASE+'/herramientas/', ...pages.map(page=>urlFor(page.slug)), BASE+'/privacy.html'];
  const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>'  <url><loc>'+esc(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
  await writeFile(new URL('sitemap.xml',output),sitemap,'utf8');
  await writeFile(new URL('robots.txt',output),'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /functions/\nSitemap: '+BASE+'/sitemap.xml\n','utf8');
  console.log('PRISMA SEO: '+pages.length+' páginas, índice, sitemap.xml y robots.txt generados.');
}
