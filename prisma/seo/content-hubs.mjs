import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tools, categories as registryCategories } from '../src/registry.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const toolMap = new Map(tools.map(tool => [tool.id, tool]));
const registryCategoryIds = new Set(registryCategories.map(category => category.id));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function shell(title, description, url, schema, main) {
  return [
    '<!doctype html>',
    '<html lang="es" data-theme="dark">',
    '<head>',
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
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="/aurora-system.css">',
    '<link rel="stylesheet" href="/seo.css">',
    '<script>try { const saved = localStorage.getItem("prisma-theme"); if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved; } catch {}</script>',
    '<script type="application/ld+json">' + safeJson(schema) + '</script>',
    '</head>',
    '<body class="seo-page">',
    '<header class="seo-header"><div class="seo-header-inner">',
    '<a class="seo-brand" href="/" aria-label="Volver a Prisma Space"><img src="/assets/prisma-mark.svg" alt="" width="36" height="36"><span><strong>Prisma Space</strong><small>ECOSISTEMA DIGITAL</small></span></a>',
    '<nav class="seo-nav" aria-label="Navegación principal"><a href="/categorias/">Categorías</a><a href="/guias/">Guías</a><a href="/soluciones/">Soluciones</a><a href="/herramientas/">Herramientas</a><button id="seo-theme" type="button" aria-label="Cambiar tema">◐ <span>Tema</span></button></nav>',
    '</div></header>',
    main,
    '<footer class="seo-footer"><div><a href="/">Prisma Space</a><span>Herramientas con intención.</span></div><nav aria-label="Enlaces del pie de página"><a href="/herramientas/">Herramientas</a><a href="/categorias/">Categorías</a><a href="/soluciones/">Soluciones</a><a href="/guias/">Guías</a><a href="/privacy.html#privacidad">Privacidad y uso</a></nav></footer>',
    '<script>(function(){ const button = document.getElementById("seo-theme"); if(!button) return; button.addEventListener("click", function(){ const next = document.documentElement.dataset.theme === "light" ? "dark" : "light"; document.documentElement.dataset.theme = next; try {localStorage.setItem("prisma-theme", next);}catch{} const meta=document.querySelector("meta[name=theme-color]");if(meta)meta.content=next==="light"?"#f3f7fc":"#0e121d"; }); })();</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function breadcrumb(items) {
  const html = items.map((item, index) => {
    const current = index === items.length - 1;
    return (index ? '<span aria-hidden="true">/</span>' : '') +
      (current ? '<span aria-current="page">' + esc(item.name) + '</span>' : '<a href="' + esc(item.href) + '">' + esc(item.name) + '</a>');
  }).join('');
  return '<nav class="seo-breadcrumb" aria-label="Ruta de navegación">' + html + '</nav>';
}

function faqHtml(faqs) {
  if (!faqs || !faqs.length) return '';
  return '<section class="seo-faq" aria-labelledby="seo-faq-title"><div class="seo-section-label">PREGUNTAS FRECUENTES</div><h2 id="seo-faq-title">Dudas habituales</h2>' +
    faqs.map(pair => '<details><summary>' + esc(pair[0]) + '</summary><p>' + esc(pair[1]) + '</p></details>').join('\n') +
    '</section>';
}

function infoCards(items, className) {
  return '<div class="' + (className || 'seo-hub-grid') + '">' + items.map(item =>
    '<a class="seo-hub-card" href="' + esc(item.href) + '">' +
    '<span class="seo-hub-card-kicker">' + esc(item.kicker || 'PRISMA SPACE') + '</span>' +
    '<strong>' + esc(item.title) + '</strong>' +
    '<span>' + esc(item.description) + '</span>' +
    '<small>' + esc(item.label || 'Explorar') + ' ↗</small></a>'
  ).join('\n') + '</div>';
}

function toolHref(toolId, pageByTool) {
  const page = pageByTool.get(toolId);
  return page ? '/herramientas/' + page.slug + '/' : '/?tool=' + encodeURIComponent(toolId);
}

function toolCards(ids, pageByTool, covered, limit) {
  const unique = [...new Set(ids)].filter(id => covered.has(id) && toolMap.has(id));
  const selected = typeof limit === 'number' ? unique.slice(0, limit) : unique;
  return '<div class="seo-tool-grid">' + selected.map(id => {
    const tool = toolMap.get(id);
    const status = tool.status === 'beta' ? 'En beta' : 'Disponible';
    const mode = tool.mode === 'local' ? 'Procesamiento local' : tool.mode === 'browser' ? 'En el navegador' : tool.mode === 'byok' ? 'Conexión propia' : 'Servicio conectado';
    return '<a class="seo-tool-card" href="' + esc(toolHref(id, pageByTool)) + '">' +
      '<strong>' + esc(tool.name) + '</strong><span>' + esc(tool.description) + '</span>' +
      '<small>' + esc(status) + ' · ' + esc(mode) + ' · Abrir herramienta ↗</small></a>';
  }).join('\n') + '</div>';
}

function relatedCards(slugs, lookup, prefix, label) {
  const items = (slugs || []).map(slug => lookup.get(slug)).filter(Boolean).map(item => ({
    href: prefix + item.slug + '/',
    title: item.h1,
    description: item.description,
    kicker: label,
    label: 'Leer'
  }));
  return items.length ? infoCards(items, 'seo-hub-grid seo-hub-grid-compact') : '';
}

function validateContent(data, audit, pages) {
  const covered = new Set(audit.inventory.filter(item => Array.isArray(item.pages) && item.pages.length).map(item => item.tool));
  const all = [...data.categories, ...data.solutions, ...data.guides];
  const slugs = new Set();
  for (const item of all) {
    if (!slugPattern.test(item.slug) || slugs.has(item.slug)) throw new Error('SEO hubs: slug inválido o duplicado: ' + item.slug);
    slugs.add(item.slug);
    for (const key of ['title', 'h1', 'description', 'intro']) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error('SEO hubs: contenido incompleto en ' + item.slug + ' (' + key + ')');
    if (item.faqs && (!Array.isArray(item.faqs) || item.faqs.length < 2 || item.faqs.some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== 'string' || !value.trim())))) throw new Error('SEO hubs: FAQ inválida en ' + item.slug);
    for (const id of item.toolIds || item.steps?.map(step => step.toolId).filter(Boolean) || []) {
      if (!toolMap.has(id)) throw new Error('SEO hubs: herramienta inexistente ' + id + ' en ' + item.slug);
      if (!covered.has(id)) throw new Error('SEO hubs: herramienta no aprobada para promoción ' + id + ' en ' + item.slug);
    }
    for (const step of item.steps || []) if (!step.title || !step.body || !toolMap.has(step.toolId) || !covered.has(step.toolId)) throw new Error('SEO hubs: paso o herramienta no válida en ' + item.slug);
    for (const key of ['solutionSlugs', 'guideSlugs', 'categorySlugs']) for (const slug of item[key] || []) {
      const expected = key === 'solutionSlugs' ? data.solutions : key === 'guideSlugs' ? data.guides : data.categories;
      if (!expected.some(entry => entry.slug === slug)) throw new Error('SEO hubs: referencia interna inexistente ' + slug + ' desde ' + item.slug);
    }
  }
  for (const category of data.categories) {
    if (!Array.isArray(category.toolCategories) || !category.toolCategories.length || category.toolCategories.some(id => !registryCategoryIds.has(id) || id === 'all')) throw new Error('SEO hubs: categoría del catálogo inválida en ' + category.slug);
    if (!Array.isArray(category.highlights) || category.highlights.length < 3) throw new Error('SEO hubs: faltan bloques útiles en ' + category.slug);
  }
  const existing = new Set(pages.map(page => page.slug));
  for (const guide of data.guides) if (!existing.has(guide.primaryPageSlug)) throw new Error('SEO hubs: página principal no existente en guía ' + guide.slug);
  return { covered, slugs };
}

function categoryPage(category, seoPages, pageByTool, covered, categoryLookup, solutionLookup, guideLookup, base) {
  const selectedPages = seoPages.filter(page => {
    const tool = toolMap.get(page.tool);
    return tool && category.toolCategories.includes(tool.category);
  });
  const url = base + '/categorias/' + category.slug + '/';
  const cards = infoCards(category.highlights.map(item => ({title:item.title,description:item.body,href:'#herramientas',kicker:'QUÉ PUEDES HACER',label:'Ver herramientas'})), 'seo-hub-grid seo-hub-grid-compact');
  const schema = {
    '@context':'https://schema.org',
    '@type':'CollectionPage',
    name:category.h1,
    description:category.description,
    url,
    inLanguage:'es',
    mainEntity:{'@type':'ItemList',itemListElement:selectedPages.slice(0,60).map((page,index)=>({'@type':'ListItem',position:index+1,name:page.h1,url:base+'/herramientas/'+page.slug+'/'}))}
  };
  const main = '<main class="seo-main">' +
    breadcrumb([{name:'Inicio',href:'/'},{name:'Categorías',href:'/categorias/'},{name:category.name}]) +
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>CATEGORÍA · PRISMA SPACE</div><h1>' + esc(category.h1) + '</h1><p>' + esc(category.intro) + '</p></section>' +
    cards +
    '<section class="seo-category seo-hub-section" id="herramientas"><div class="seo-section-label">CATÁLOGO DISPONIBLE</div><h2>Explora ' + selectedPages.length + ' herramientas y operaciones</h2><p class="seo-hub-copy">Cada ficha explica el resultado esperado, los pasos y las limitaciones de la operación. Las funciones beta se identifican antes de abrirlas.</p>' +
    '<div class="seo-tool-grid">' + selectedPages.map(page => {
      const tool = toolMap.get(page.tool);
      const status = tool.status === 'beta' ? 'En beta' : 'Disponible';
      return '<a class="seo-tool-card" href="/herramientas/' + esc(page.slug) + '/"><strong>' + esc(page.h1) + '</strong><span>' + esc(page.description) + '</span><small>' + esc(status) + ' · Ver herramienta ↗</small></a>';
    }).join('\n') + '</div></section>' +
    (category.solutionSlugs?.length ? '<section class="seo-related"><div class="seo-section-label">RECORRIDOS PRÁCTICOS</div><h2>Soluciones relacionadas</h2>' + relatedCards(category.solutionSlugs, solutionLookup, '/soluciones/', 'SOLUCIÓN') + '</section>' : '') +
    (category.guideSlugs?.length ? '<section class="seo-related"><div class="seo-section-label">APRENDE A HACERLO</div><h2>Guías paso a paso</h2>' + relatedCards(category.guideSlugs, guideLookup, '/guias/', 'GUÍA') + '</section>' : '') +
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Disponibilidad y límites</strong><p>El catálogo distingue funciones disponibles, beta, procesamiento local y servicios conectados. Consulta cada ficha y revisa el resultado antes de utilizarlo.</p></div></aside>' +
    faqHtml(category.faqs) + '</main>';
  return {url, html:shell(category.title,category.description,url,schema,main), count:selectedPages.length};
}

function solutionPage(solution, pageByTool, covered, categoryLookup, guideLookup, base) {
  const url = base + '/soluciones/' + solution.slug + '/';
  const steps = '<ol class="seo-workflow-steps">' + solution.steps.map((step,index) => {
    const tool = toolMap.get(step.toolId);
    return '<li><span class="seo-workflow-number">' + (index+1) + '</span><div><h3>' + esc(step.title) + '</h3><p>' + esc(step.body) + '</p><a class="seo-inline-link" href="' + esc(toolHref(step.toolId,pageByTool)) + '">Abrir ' + esc(tool.name) + ' ↗</a></div></li>';
  }).join('\n') + '</ol>';
  const schema = {'@context':'https://schema.org','@type':'WebPage',name:solution.h1,description:solution.description,url,inLanguage:'es'};
  const main = '<main class="seo-main">' +
    breadcrumb([{name:'Inicio',href:'/'},{name:'Soluciones',href:'/soluciones/'},{name:solution.h1}]) +
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>SOLUCIÓN · PRISMA SPACE</div><h1>' + esc(solution.h1) + '</h1><p>' + esc(solution.intro) + '</p></section>' +
    '<section class="seo-panel seo-workflow-panel"><div class="seo-section-label">RECORRIDO RECOMENDADO</div><h2>Resuelve la tarea paso a paso</h2>' + steps + '</section>' +
    '<section class="seo-related"><div class="seo-section-label">HERRAMIENTAS DEL RECORRIDO</div><h2>Abre la operación que necesitas</h2>' + toolCards(solution.toolIds,pageByTool,covered) + '</section>' +
    (solution.categorySlugs?.length ? '<section class="seo-related"><div class="seo-section-label">EXPLORA POR TEMA</div><h2>Categorías relacionadas</h2>' + relatedCards(solution.categorySlugs,categoryLookup,'/categorias/','CATEGORÍA') + '</section>' : '') +
    (solution.guideSlugs?.length ? '<section class="seo-related"><div class="seo-section-label">SIGUIENTE PASO</div><h2>Guías para profundizar</h2>' + relatedCards(solution.guideSlugs,guideLookup,'/guias/','GUÍA') + '</section>' : '') +
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Comprueba el resultado</strong><p>' + esc(solution.note) + '</p></div></aside>' +
    faqHtml(solution.faqs) + '</main>';
  return {url,html:shell(solution.title,solution.description,url,schema,main)};
}

function guidePage(guide, pageByTool, covered, solutionLookup, base) {
  const url = base + '/guias/' + guide.slug + '/';
  const primary = pageByTool.get(toolMap.get(guide.steps[0].toolId)?.id);
  const steps = '<ol class="seo-workflow-steps">' + guide.steps.map((step,index) => {
    const tool = toolMap.get(step.toolId);
    return '<li><span class="seo-workflow-number">' + (index+1) + '</span><div><h3>' + esc(step.title) + '</h3><p>' + esc(step.body) + '</p><a class="seo-inline-link" href="' + esc(toolHref(step.toolId,pageByTool)) + '">Usar ' + esc(tool.name) + ' ↗</a></div></li>';
  }).join('\n') + '</ol>';
  const article = '<div class="seo-article-sections">' + guide.sections.map(section =>
    '<section class="seo-article-section"><h2>' + esc(section.heading) + '</h2>' + section.paragraphs.map(paragraph => '<p>' + esc(paragraph) + '</p>').join('') + '</section>'
  ).join('\n') + '</div>';
  const schema = {
    '@context':'https://schema.org',
    '@type':'HowTo',
    name:guide.h1,
    description:guide.description,
    url,
    inLanguage:'es',
    step:guide.steps.map((step,index)=>({'@type':'HowToStep',position:index+1,name:step.title,text:step.body,url:base+toolHref(step.toolId,pageByTool)}))
  };
  const main = '<main class="seo-main">' +
    breadcrumb([{name:'Inicio',href:'/'},{name:'Guías',href:'/guias/'},{name:guide.h1}]) +
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>GUÍA PRÁCTICA · PRISMA SPACE</div><h1>' + esc(guide.h1) + '</h1><p>' + esc(guide.intro) + '</p><div class="seo-actions"><a class="seo-cta" href="' + esc('/herramientas/'+guide.primaryPageSlug+'/') + '">Abrir herramienta relacionada <span aria-hidden="true">↗</span></a><a class="seo-subtle" href="#pasos">Ver pasos ↓</a></div></section>' +
    article +
    '<section class="seo-related" id="pasos"><div class="seo-section-label">PASO A PASO</div><h2>Cómo hacerlo en Prisma Space</h2>' + steps + '</section>' +
    '<section class="seo-related"><div class="seo-section-label">HERRAMIENTAS RELACIONADAS</div><h2>Continúa con estas operaciones</h2>' + toolCards(guide.toolIds,pageByTool,covered) + '</section>' +
    (guide.solutionSlugs?.length ? '<section class="seo-related"><div class="seo-section-label">RESUELVE UNA TAREA COMPLETA</div><h2>Soluciones relacionadas</h2>' + relatedCards(guide.solutionSlugs,solutionLookup,'/soluciones/','SOLUCIÓN') + '</section>' : '') +
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Antes de continuar</strong><p>' + esc(guide.note) + '</p></div></aside>' +
    faqHtml(guide.faqs) + '</main>';
  return {url,html:shell(guide.title,guide.description,url,schema,main)};
}

function hubIndex(kind, title, description, url, items, prefix, kicker) {
  const cards = items.map(item => ({
    href:prefix + item.slug + '/',
    title:item.h1,
    description:item.description,
    kicker,
    label:kind === 'GUÍAS' ? 'Leer guía' : kind === 'SOLUCIONES' ? 'Ver recorrido' : 'Explorar'
  }));
  const schema = {'@context':'https://schema.org','@type':'CollectionPage',name:title,description,url,inLanguage:'es',numberOfItems:items.length};
  const main = '<main class="seo-main">' +
    breadcrumb([{name:'Inicio',href:'/'},{name:kind.charAt(0)+kind.slice(1).toLowerCase()}]) +
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>' + esc(kind) + ' · PRISMA SPACE</div><h1>' + esc(title) + '</h1><p>' + esc(description) + '</p></section>' +
    infoCards(cards,'seo-hub-grid') +
    '<section class="seo-hub-crosslinks"><a href="/categorias/">Categorías</a><a href="/soluciones/">Soluciones</a><a href="/guias/">Guías paso a paso</a><a href="/herramientas/">Todas las herramientas</a></section>' +
    '</main>';
  return shell(title,description,url,schema,main);
}

function toolDiscoverySection(page, pageByTool, categoryLookup, solutionLookup, guideLookup, toolMapRef) {
  const tool = toolMapRef.get(page.tool);
  if (!tool) return '';
  const category = [...categoryLookup.values()].find(item => item.toolCategories.includes(tool.category));
  const solution = [...solutionLookup.values()].find(item => item.toolIds.includes(page.tool));
  const guide = [...guideLookup.values()].find(item => item.toolIds.includes(page.tool));
  const items = [];
  if (category) items.push({href:'/categorias/'+category.slug+'/',title:category.name,description:category.description,kicker:'CATEGORÍA',label:'Explorar'});
  if (solution) items.push({href:'/soluciones/'+solution.slug+'/',title:solution.h1,description:solution.description,kicker:'SOLUCIÓN',label:'Ver recorrido'});
  if (guide) items.push({href:'/guias/'+guide.slug+'/',title:guide.h1,description:guide.description,kicker:'GUÍA',label:'Leer'});
  if (!items.length) return '';
  return '<section class="seo-discovery"><div class="seo-section-label">SIGUE EXPLORANDO PRISMA</div><h2>Más formas de resolver tu tarea</h2>' + infoCards(items,'seo-hub-grid seo-hub-grid-compact') + '</section>';
}

export async function generateContentHubs(output, {base, pages}) {
  const [categoryData, solutionData, guideData, auditData] = await Promise.all([
    readFile(new URL('./content-categories.json',import.meta.url),'utf8').then(JSON.parse),
    readFile(new URL('./content-solutions.json',import.meta.url),'utf8').then(JSON.parse),
    readFile(new URL('./content-guides.json',import.meta.url),'utf8').then(JSON.parse),
    readFile(new URL('./audit.json',import.meta.url),'utf8').then(JSON.parse)
  ]);
  const data = {categories:categoryData.categories,solutions:solutionData.solutions,guides:guideData.guides};
  const {covered} = validateContent(data,auditData,pages);
  const categoryLookup = new Map(data.categories.map(item=>[item.slug,item]));
  const solutionLookup = new Map(data.solutions.map(item=>[item.slug,item]));
  const guideLookup = new Map(data.guides.map(item=>[item.slug,item]));
  const pageByTool = new Map();
  for (const page of pages) if (!pageByTool.has(page.tool)) pageByTool.set(page.tool,page);

  const categoryDir = new URL('categorias/',output);
  const solutionDir = new URL('soluciones/',output);
  const guideDir = new URL('guias/',output);
  await Promise.all([mkdir(categoryDir,{recursive:true}),mkdir(solutionDir,{recursive:true}),mkdir(guideDir,{recursive:true})]);

  const categoryCounts = data.categories.map(category => {
    const count = pages.filter(page => {
      const tool = toolMap.get(page.tool);
      return tool && category.toolCategories.includes(tool.category);
    }).length;
    return {...category,count};
  });

  const categoryUrl = base + '/categorias/';
  const solutionUrl = base + '/soluciones/';
  const guideUrl = base + '/guias/';
  const categoryIndexTitle = 'Categorías de herramientas online | Prisma Space';
  const solutionIndexTitle = 'Soluciones para tareas digitales | Prisma Space';
  const guideIndexTitle = 'Guías y tutoriales de herramientas online | Prisma Space';
  const categoryIndexDescription = 'Explora las categorías de Prisma Space: PDF, imágenes, inteligencia artificial, audio, vídeo, texto, datos, desarrollo, privacidad y estudio.';
  const solutionIndexDescription = 'Recorridos prácticos para organizar documentos, optimizar imágenes, trabajar con datos, estudiar, crear contenido y resolver tareas digitales.';
  const guideIndexDescription = 'Guías paso a paso para usar herramientas PDF, imágenes, datos, QR, audio e inteligencia artificial con criterio y revisar los resultados.';
  await writeFile(new URL('index.html',categoryDir),hubIndex('CATEGORÍAS',categoryIndexTitle,categoryIndexDescription,categoryUrl,categoryCounts.map(item=>({...item,description:item.description+' · '+item.count+' fichas de herramienta'})),'/categorias/','CATEGORÍA'),'utf8');
  await writeFile(new URL('index.html',solutionDir),hubIndex('SOLUCIONES',solutionIndexTitle,solutionIndexDescription,solutionUrl,data.solutions,'/soluciones/','SOLUCIÓN'),'utf8');
  await writeFile(new URL('index.html',guideDir),hubIndex('GUÍAS',guideIndexTitle,guideIndexDescription,guideUrl,data.guides,'/guias/','GUÍA'),'utf8');

  const generated = [categoryUrl,solutionUrl,guideUrl];
  for (const category of data.categories) {
    const result = categoryPage(category,pages,pageByTool,covered,categoryLookup,solutionLookup,guideLookup,base);
    const folder = new URL(category.slug+'/',categoryDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),result.html,'utf8');
    generated.push(result.url);
  }
  for (const solution of data.solutions) {
    const result = solutionPage(solution,pageByTool,covered,categoryLookup,guideLookup,base);
    const folder = new URL(solution.slug+'/',solutionDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),result.html,'utf8');
    generated.push(result.url);
  }
  for (const guide of data.guides) {
    const result = guidePage(guide,pageByTool,covered,solutionLookup,base);
    const folder = new URL(guide.slug+'/',guideDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),result.html,'utf8');
    generated.push(result.url);
  }

  for (const page of pages) {
    const path = new URL('herramientas/'+page.slug+'/index.html',output);
    const html = await readFile(path,'utf8');
    const section = toolDiscoverySection(page,pageByTool,categoryLookup,solutionLookup,guideLookup,toolMap);
    if (section && !html.includes('class="seo-discovery"')) await writeFile(path,html.replace('</main>',section+'</main>'),'utf8');
  }
  const directoryPath = new URL('herramientas/index.html',output);
  const directoryHtml = await readFile(directoryPath,'utf8');
  const directoryLinks = '<section class="seo-hub-crosslinks"><div class="seo-section-label">EXPLORA PRISMA SPACE</div><h2>Encuentra una herramienta por tema o por objetivo</h2><a href="/categorias/">Ver categorías</a><a href="/soluciones/">Explorar soluciones</a><a href="/guias/">Leer guías prácticas</a></section>';
  if (!directoryHtml.includes('seo-hub-crosslinks')) await writeFile(directoryPath,directoryHtml.replace('</main>',directoryLinks+'</main>'),'utf8');

  return generated;
}
