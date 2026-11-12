import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tools, categories as registryCategories } from '../src/registry.js';
import translations from '../src/locales/en.js';
import { SEO_BASE as BASE } from './config.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const safeJson = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
const t = value => translations[String(value ?? '')] || String(value ?? '');
const toolMap = new Map(tools.map(tool => [tool.id, tool]));
const categoryMap = new Map(registryCategories.map((category,index) => [category.id,{...category,name:t(category.name),order:index}]));
const appUrl = '/en/';
const toolUrl = page => {
  const query = new URLSearchParams({tool:page.tool});
  if (page.format) query.set('format',page.format);
  return appUrl + '?' + query.toString();
};
const modeLabel = tool => tool.mode === 'local' ? 'Local processing' : tool.mode === 'browser' ? 'In your browser' : tool.mode === 'byok' ? 'Your own connection' : 'Connected service';
const statusLabel = tool => tool.status === 'beta' ? 'Beta' : 'Available';
const categoryFor = tool => categoryMap.get(tool.category) || {name:'Tools',order:99};
const compactTitle = value => {
  const title = String(value || '').trim();
  if (title.length <= 70) return title;
  const withoutBrand = title.replace(/\s*\|\s*Prisma Space$/i,'').trim();
  if (withoutBrand.length <= 70) return withoutBrand;
  return withoutBrand.slice(0,67).replace(/\s+\S*$/,'').trim() + '…';
};
const compactDescription = value => {
  const description = String(value || '').trim();
  if (description.length <= 160) return description;
  return description.slice(0,157).replace(/\s+\S*$/,'').trim() + '…';
};
const localFile = (url,output) => {
  const pathname = new URL(url).pathname.replace(/^\/+/,'');
  return new URL(pathname ? (pathname.endsWith('/') ? pathname+'index.html' : pathname) : 'index.html',output);
};
function alternateTags(esUrl,enUrl) {
  return [
    '<link rel="alternate" hreflang="es" href="' + esc(esUrl) + '">',
    '<link rel="alternate" hreflang="en" href="' + esc(enUrl) + '">',
    '<link rel="alternate" hreflang="x-default" href="' + esc(esUrl) + '">'
  ].join('\n');
}
function head(title,description,url,schema,esUrl) {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="theme-color" content="#0e121d">',
    '<meta name="description" content="' + esc(compactDescription(description)) + '">',
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta name="application-name" content="Prisma Space">',
    '<title>' + esc(compactTitle(title)) + '</title>',
    '<link rel="canonical" href="' + esc(url) + '">',
    alternateTags(esUrl,url),
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Prisma Space">',
    '<meta property="og:locale" content="en_US">',
    '<meta property="og:title" content="' + esc(compactTitle(title)) + '">',
    '<meta property="og:description" content="' + esc(compactDescription(description)) + '">',
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
    '<script type="application/ld+json">' + safeJson(schema) + '</script>'
  ].join('\n');
}
function header(esUrl) {
  return [
    '<header class="seo-header"><div class="seo-header-inner">',
    '<a class="seo-brand" href="/en/" aria-label="Back to Prisma Space"><img src="/assets/prisma-mark.svg" alt="" width="36" height="36"><span><strong>Prisma Space</strong><small>AI WORKSPACE</small></span></a>',
    '<nav class="seo-nav" aria-label="Main navigation"><a href="/en/categories/">Categories</a><a href="/en/guides/">Guides</a><a href="/en/solutions/">Solutions</a><a href="/en/tools/">Tools</a><a href="/en/">Prisma Core</a><button id="seo-theme" type="button" aria-label="Change theme">◐ <span>Theme</span></button><a class="seo-language-switch" href="' + esc(esUrl) + '" lang="es">Español</a></nav>',
    '</div></header>'
  ].join('\n');
}
function footer() {
  return [
    '<footer class="seo-footer"><div><a href="/en/">Prisma Space</a><span>Digital tools with purpose.</span></div><nav aria-label="Footer links"><a href="/en/tools/">Tools</a><a href="/en/categories/">Categories</a><a href="/en/solutions/">Solutions</a><a href="/en/guides/">Guides</a><a href="/en/privacy.html#privacidad">Privacy and terms</a></nav></footer>',
    '<script>(function(){ const button = document.getElementById("seo-theme"); if(!button) return; button.addEventListener("click", function(){ const next = document.documentElement.dataset.theme === "light" ? "dark" : "light"; document.documentElement.dataset.theme = next; try {localStorage.setItem("prisma-theme", next);}catch{} const meta=document.querySelector("meta[name=theme-color]");if(meta)meta.content=next==="light"?"#f3f7fc":"#0e121d"; }); })();</script>'
  ].join('\n');
}
function markup(title,description,url,schema,main,esUrl) {
  return ['<!doctype html>','<html lang="en" data-theme="dark">','<head>',head(title,description,url,schema,esUrl),'</head>','<body class="seo-page">',header(esUrl),main,footer(),'</body>','</html>',''].join('\n');
}
function breadcrumb(items) {
  return '<nav class="seo-breadcrumb" aria-label="Breadcrumb">' + items.map((item,index) =>
    (index ? '<span aria-hidden="true">/</span>' : '') +
    (index === items.length-1 ? '<span aria-current="page">' + esc(item.name) + '</span>' : '<a href="' + esc(item.href) + '">' + esc(item.name) + '</a>')
  ).join('') + '</nav>';
}
function faqHtml(faqs) {
  if (!faqs?.length) return '';
  return '<section class="seo-faq" aria-labelledby="faq-title"><div class="seo-section-label">FREQUENTLY ASKED QUESTIONS</div><h2 id="faq-title">Common questions</h2>' +
    faqs.map(pair => '<details><summary>' + esc(pair[0]) + '</summary><p>' + esc(pair[1]) + '</p></details>').join('\n') + '</section>';
}
function infoCards(items,className) {
  return '<div class="' + (className || 'seo-hub-grid') + '">' + items.map(item =>
    '<a class="seo-hub-card" href="' + esc(item.href) + '"><span class="seo-hub-card-kicker">' + esc(item.kicker || 'PRISMA SPACE') + '</span><strong>' + esc(item.title) + '</strong><span>' + esc(item.description) + '</span><small>' + esc(item.label || 'Explore') + ' ↗</small></a>'
  ).join('\n') + '</div>';
}
function toolCard(page,tool) {
  return '<a class="seo-tool-card" href="/en/tools/' + esc(page.englishSlug) + '/"><strong>' + esc(page.h1) + '</strong><span>' + esc(page.description) + '</span><small>' + esc(statusLabel(tool)) + ' · ' + esc(modeLabel(tool)) + ' · Open tool ↗</small></a>';
}
function relatedCards(items,lookup,prefix,label) {
  const cards=(items||[]).map(slug=>lookup.get(slug)).filter(Boolean).map(item=>({
    href:prefix+item.englishSlug+'/',title:item.h1,description:item.description,kicker:label,label:'Read more'
  }));
  return cards.length ? infoCards(cards,'seo-hub-grid seo-hub-grid-compact') : '';
}
function toolLanding(page,pages,toolMap) {
  const tool=toolMap.get(page.tool);
  if(!tool) throw new Error('English SEO: missing tool '+page.tool);
  const esUrl=BASE+'/herramientas/'+page.sourceSlug+'/';
  const url=BASE+'/en/tools/'+page.englishSlug+'/';
  const category=categoryFor(tool).name;
  const peers=pages.filter(other=>{
    const peerTool=toolMap.get(other.tool);
    return peerTool && peerTool.category===tool.category && other.sourceSlug!==page.sourceSlug;
  });
  const related=[...peers,...pages.filter(other=>!peers.includes(other))].slice(0,4);
  const schema=[
    {'@context':'https://schema.org','@type':'WebApplication',name:page.h1+' | Prisma Space',description:page.description,url,applicationCategory:'UtilitiesApplication',operatingSystem:'Web',inLanguage:'en',...(['local','browser'].includes(tool.mode)?{isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}}:{})},
    {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'Prisma Space',item:BASE+'/en/'},
      {'@type':'ListItem',position:2,name:'Tools',item:BASE+'/en/tools/'},
      {'@type':'ListItem',position:3,name:page.h1,item:url}
    ]}
  ];
  const steps=page.steps.map(step=>'<li><span>'+esc(step)+'</span></li>').join('\n');
  const relatedHtml=related.map(item=>{
    const peerTool=toolMap.get(item.tool);
    return '<a class="seo-related-card" href="/en/tools/'+esc(item.englishSlug)+'/"><strong>'+esc(item.h1)+'</strong><small>'+esc(categoryFor(peerTool).name)+'</small><span aria-hidden="true">↗</span></a>';
  }).join('\n');
  const body=[
    '<main class="seo-main">',
    breadcrumb([{name:'Home',href:'/en/'},{name:'Tools',href:'/en/tools/'},{name:category,href:'/en/categories/'},{name:page.h1}]),
    '<section class="seo-hero"><div class="seo-hero-copy">',
    '<div class="seo-eyebrow"><i></i>'+esc(category)+' · '+esc(modeLabel(tool))+' · '+esc(statusLabel(tool))+'</div>',
    '<h1>'+esc(page.h1)+'</h1><p class="seo-lead">'+esc(page.description)+'</p>',
    '<div class="seo-actions"><a class="seo-cta" href="'+esc(toolUrl(page))+'">Open tool <span aria-hidden="true">↗</span></a><a class="seo-subtle" href="#how-it-works">How it works ↓</a></div>',
    '<p class="seo-privacy"><span aria-hidden="true">◇</span> '+esc(page.privacyNote || (['local','browser'].includes(tool.mode)?'Processed in your browser · No registration required':'Review the tool usage conditions'))+'</p></div>',
    '<div class="seo-preview" aria-hidden="true"><div class="seo-preview-orb"></div><div class="seo-preview-label">PRISMA SPACE / '+esc(page.englishSlug.toUpperCase().replaceAll('-',' '))+'</div>',
    '<div class="seo-preview-content"><div class="seo-preview-symbol"><img src="/assets/prisma-mark.svg" width="46" height="46" alt=""></div><strong>'+esc(t(tool.name))+'</strong><span>'+(tool.status==='beta'?'Beta feature':'Ready to use')+'</span></div>',
    '<div class="seo-preview-foot"><span>One task, one solution</span><span>FREE</span></div></div></section>',
    '<div class="seo-content-grid" id="how-it-works">',
    '<section class="seo-panel"><div class="seo-section-label">WHAT YOU CAN DO</div><h2>'+esc(page.h1)+': what you need to know</h2><p>'+esc(page.intro)+'</p><p>'+esc(page.details)+'</p></section>',
    '<section class="seo-panel"><div class="seo-section-label">STEP BY STEP</div><h2>How to use this tool</h2><ol class="seo-steps">'+steps+'</ol><a class="seo-inline-link" href="'+esc(toolUrl(page))+'">Open '+esc(t(tool.name))+' ↗</a></section>',
    '</div>',
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Before you start</strong><p>'+esc(page.tip)+'</p>'+(tool.status==='beta'?'<small>This feature is marked as beta in the Prisma Space catalog.</small>':'')+'</div></aside>',
    faqHtml(page.faqs),
    '<section class="seo-related" aria-labelledby="related-title"><div class="seo-related-heading"><div><div class="seo-section-label">YOU MAY ALSO NEED</div><h2 id="related-title">Related tools</h2></div><a href="/en/tools/">Browse all ↗</a></div><div class="seo-related-grid">'+relatedHtml+'</div></section>',
    '</main>'
  ].join('\n');
  return markup(page.title,page.description,url,schema,body,esUrl);
}
function directory(pages,toolMap) {
  const url=BASE+'/en/tools/';
  const title='Free online tools for everyday tasks | Prisma Space';
  const description='Explore Prisma Space tools for PDF files, images, video, audio, AI, study, data, and productivity. Open each tool directly in your browser.';
  const categories=[...new Set(pages.map(page=>toolMap.get(page.tool)?.category).filter(Boolean))]
    .sort((a,b)=>(categoryMap.get(a)?.order||99)-(categoryMap.get(b)?.order||99));
  const tags=categories.map(id=>'<a href="#'+esc(id)+'">'+esc(categoryMap.get(id)?.name||id)+' ↓</a>').join('');
  const sections=categories.map(id=>{
    const links=pages.filter(page=>toolMap.get(page.tool)?.category===id).map(page=>{
      const tool=toolMap.get(page.tool);
      return '<a class="seo-directory-card" href="/en/tools/'+esc(page.englishSlug)+'/"><strong>'+esc(page.h1)+'</strong><span>'+esc(page.description)+'</span><small>'+(tool.status==='beta'?'Beta · ':'')+'Open ↗</small></a>';
    }).join('\n');
    return '<section class="seo-category" id="'+esc(id)+'"><div class="seo-section-label">BROWSE BY CATEGORY</div><h2>'+esc(categoryMap.get(id)?.name||id)+'</h2><div class="seo-directory-grid">'+links+'</div></section>';
  }).join('\n');
  const body='<main class="seo-main"><nav class="seo-breadcrumb" aria-label="Breadcrumb"><a href="/en/">Home</a><span>/</span><span aria-current="page">Free online tools</span></nav>'+
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>FREE · PRISMA SPACE</div><h1>Free online tools to get things done</h1><p>Convert documents, edit images, process video and audio, create content, and complete study tasks with Prisma Space. Explore '+pages.length+' tools and operations, then open the one you need in one click.</p><div class="seo-tags">'+tags+'</div></section>'+
    sections+
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Availability and privacy</strong><p>Beta features may have limitations. Tools that are still in preparation are not promoted here. Review each tool usage and privacy notes before processing files.</p></div></aside></main>';
  return markup(title,description,url,{'@context':'https://schema.org','@type':'CollectionPage',name:title,description,url,inLanguage:'en'},body,BASE+'/herramientas/');
}
function categoryPage(category,pages,toolMap,solutionLookup,guideLookup) {
  const url=BASE+'/en/categories/'+category.englishSlug+'/';
  const esUrl=BASE+'/categorias/'+category.sourceSlug+'/';
  const selected=pages.filter(page=>category.toolCategories.includes(toolMap.get(page.tool)?.category));
  const highlights=infoCards(category.highlights.map(item=>({title:item.title,description:item.body,href:'#tools',kicker:'WHAT YOU CAN DO',label:'Browse tools'})),'seo-hub-grid seo-hub-grid-compact');
  const toolsHtml='<div class="seo-tool-grid">'+selected.map(page=>toolCard(page,toolMap.get(page.tool))).join('\n')+'</div>';
  const schema={'@context':'https://schema.org','@type':'CollectionPage',name:category.h1,description:category.description,url,inLanguage:'en',mainEntity:{'@type':'ItemList',itemListElement:selected.slice(0,60).map((page,index)=>({'@type':'ListItem',position:index+1,name:page.h1,url:BASE+'/en/tools/'+page.englishSlug+'/'}))}};
  const body='<main class="seo-main">'+
    breadcrumb([{name:'Home',href:'/en/'},{name:'Categories',href:'/en/categories/'},{name:category.name}])+
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>CATEGORY · PRISMA SPACE</div><h1>'+esc(category.h1)+'</h1><p>'+esc(category.intro)+'</p></section>'+
    highlights+
    '<section class="seo-category seo-hub-section" id="tools"><div class="seo-section-label">AVAILABLE CATALOG</div><h2>Explore '+selected.length+' tools and operations</h2><p class="seo-hub-copy">Each page explains the expected result, steps, and limitations. Beta features are identified before you open them.</p>'+toolsHtml+'</section>'+
    (category.solutionSlugs?.length?'<section class="seo-related"><div class="seo-section-label">PRACTICAL WORKFLOWS</div><h2>Related solutions</h2>'+relatedCards(category.solutionSlugs,solutionLookup,'/en/solutions/','SOLUTION')+'</section>':'')+
    (category.guideSlugs?.length?'<section class="seo-related"><div class="seo-section-label">LEARN HOW TO DO IT</div><h2>Step-by-step guides</h2>'+relatedCards(category.guideSlugs,guideLookup,'/en/guides/','GUIDE')+'</section>':'')+
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Availability and limitations</strong><p>The catalog distinguishes available features, beta features, local processing, and connected services. Review each page and check the result before using it.</p></div></aside>'+
    faqHtml(category.faqs)+'</main>';
  return markup(category.title,category.description,url,schema,body,esUrl);
}
function solutionPage(solution,pages,pageByTool,toolMap,categoryLookup,guideLookup) {
  const url=BASE+'/en/solutions/'+solution.englishSlug+'/';
  const esUrl=BASE+'/soluciones/'+solution.sourceSlug+'/';
  const steps='<ol class="seo-workflow-steps">'+solution.steps.map((step,index)=>{
    const page=pageByTool.get(step.toolId),tool=toolMap.get(step.toolId);
    const href=page?'/en/tools/'+page.englishSlug+'/':appUrl+'?tool='+encodeURIComponent(step.toolId);
    return '<li><span class="seo-workflow-number">'+(index+1)+'</span><div><h3>'+esc(step.title)+'</h3><p>'+esc(step.body)+'</p><a class="seo-inline-link" href="'+esc(href)+'">Open '+esc(t(tool?.name||step.toolId))+' ↗</a></div></li>';
  }).join('\n')+'</ol>';
  const toolCardsHtml='<div class="seo-tool-grid">'+(solution.toolIds||[]).map(id=>{const page=pageByTool.get(id);const tool=toolMap.get(id);return page&&tool?toolCard(page,tool):'';}).join('\n')+'</div>';
  const schema={'@context':'https://schema.org','@type':'WebPage',name:solution.h1,description:solution.description,url,inLanguage:'en'};
  const body='<main class="seo-main">'+
    breadcrumb([{name:'Home',href:'/en/'},{name:'Solutions',href:'/en/solutions/'},{name:solution.h1}])+
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>SOLUTION · PRISMA SPACE</div><h1>'+esc(solution.h1)+'</h1><p>'+esc(solution.intro)+'</p></section>'+
    '<section class="seo-panel seo-workflow-panel"><div class="seo-section-label">RECOMMENDED WORKFLOW</div><h2>Complete the task step by step</h2>'+steps+'</section>'+
    '<section class="seo-related"><div class="seo-section-label">TOOLS IN THIS WORKFLOW</div><h2>Open the operation you need</h2>'+toolCardsHtml+'</section>'+
    (solution.categorySlugs?.length?'<section class="seo-related"><div class="seo-section-label">BROWSE BY TOPIC</div><h2>Related categories</h2>'+relatedCards(solution.categorySlugs,categoryLookup,'/en/categories/','CATEGORY')+'</section>':'')+
    (solution.guideSlugs?.length?'<section class="seo-related"><div class="seo-section-label">NEXT STEP</div><h2>Guides to explore further</h2>'+relatedCards(solution.guideSlugs,guideLookup,'/en/guides/','GUIDE')+'</section>':'')+
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Check the result</strong><p>'+esc(solution.note)+'</p></div></aside>'+faqHtml(solution.faqs)+'</main>';
  return markup(solution.title,solution.description,url,schema,body,esUrl);
}
function guidePage(guide,pages,pageByTool,toolMap,solutionLookup) {
  const url=BASE+'/en/guides/'+guide.englishSlug+'/';
  const esUrl=BASE+'/guias/'+guide.sourceSlug+'/';
  const sections='<div class="seo-article-sections">'+guide.sections.map(section=>'<section class="seo-article-section"><h2>'+esc(section.heading)+'</h2>'+section.paragraphs.map(paragraph=>'<p>'+esc(paragraph)+'</p>').join('')+'</section>').join('\n')+'</div>';
  const steps='<ol class="seo-workflow-steps">'+guide.steps.map((step,index)=>{
    const page=pageByTool.get(step.toolId),tool=toolMap.get(step.toolId);
    const href=page?'/en/tools/'+page.englishSlug+'/':appUrl+'?tool='+encodeURIComponent(step.toolId);
    return '<li><span class="seo-workflow-number">'+(index+1)+'</span><div><h3>'+esc(step.title)+'</h3><p>'+esc(step.body)+'</p><a class="seo-inline-link" href="'+esc(href)+'">Use '+esc(t(tool?.name||step.toolId))+' ↗</a></div></li>';
  }).join('\n')+'</ol>';
  const toolCardsHtml='<div class="seo-tool-grid">'+(guide.toolIds||[]).map(id=>{const page=pageByTool.get(id);const tool=toolMap.get(id);return page&&tool?toolCard(page,tool):'';}).join('\n')+'</div>';
  const primary=pages.find(page=>page.sourceSlug===guide.primaryPageSlug);
  const schema={'@context':'https://schema.org','@type':'HowTo',name:guide.h1,description:guide.description,url,inLanguage:'en',step:guide.steps.map((step,index)=>({'@type':'HowToStep',position:index+1,name:step.title,text:step.body,url:BASE+(pageByTool.get(step.toolId)?'/en/tools/'+pageByTool.get(step.toolId).englishSlug+'/':appUrl)}))};
  const body='<main class="seo-main">'+
    breadcrumb([{name:'Home',href:'/en/'},{name:'Guides',href:'/en/guides/'},{name:guide.h1}])+
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>PRACTICAL GUIDE · PRISMA SPACE</div><h1>'+esc(guide.h1)+'</h1><p>'+esc(guide.intro)+'</p><div class="seo-actions"><a class="seo-cta" href="'+esc(primary?'/en/tools/'+primary.englishSlug+'/':appUrl)+'">Open related tool <span aria-hidden="true">↗</span></a><a class="seo-subtle" href="#steps">View steps ↓</a></div></section>'+
    sections+
    '<section class="seo-related" id="steps"><div class="seo-section-label">STEP BY STEP</div><h2>How to do it in Prisma Space</h2>'+steps+'</section>'+
    '<section class="seo-related"><div class="seo-section-label">RELATED TOOLS</div><h2>Continue with these operations</h2>'+toolCardsHtml+'</section>'+
    (guide.solutionSlugs?.length?'<section class="seo-related"><div class="seo-section-label">COMPLETE THE TASK</div><h2>Related solutions</h2>'+relatedCards(guide.solutionSlugs,solutionLookup,'/en/solutions/','SOLUTION')+'</section>':'')+
    '<aside class="seo-note"><span class="seo-note-icon">i</span><div><strong>Before you continue</strong><p>'+esc(guide.note)+'</p></div></aside>'+faqHtml(guide.faqs)+'</main>';
  return markup(guide.title,guide.description,url,schema,body,esUrl);
}
function hubIndex(kind,title,description,url,items,prefix,esUrl) {
  const cards=items.map(item=>({href:prefix+item.englishSlug+'/',title:item.h1,description:item.description,kicker:kind.toUpperCase(),label:kind==='Guides'?'Read guide':kind==='Solutions'?'View workflow':'Explore'}));
  const schema={'@context':'https://schema.org','@type':'CollectionPage',name:title,description,url,inLanguage:'en',numberOfItems:items.length};
  const body='<main class="seo-main">'+breadcrumb([{name:'Home',href:'/en/'},{name:kind}])+
    '<section class="seo-directory-hero"><div class="seo-eyebrow"><i></i>'+esc(kind.toUpperCase())+' · PRISMA SPACE</div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></section>'+
    infoCards(cards,'seo-hub-grid')+
    '<section class="seo-hub-crosslinks"><a href="/en/categories/">Categories</a><a href="/en/solutions/">Solutions</a><a href="/en/guides/">Step-by-step guides</a><a href="/en/tools/">All tools</a></section></main>';
  return markup(title,description,url,schema,body,esUrl);
}
function injectAlternates(html,esUrl,enUrl) {
  if (!html.includes('hreflang="en"')) html=html.replace('</head>',alternateTags(esUrl,enUrl)+'\n</head>');
  if (html.includes('class="seo-nav"') && !html.includes('seo-language-switch')) {
    html=html.replace(/(<nav class="seo-nav"[^>]*>)([\s\S]*?)(<\/nav>)/, '$1$2<a class="seo-language-switch" href="'+enUrl+'" lang="en">English</a>$3');
  }
  return html;
}
function injectSpanishPrivacyLink(html) {
  if (html.includes('href="/en/privacy.html"')) return html;
  return html.replace(/(<a class="back"[^>]*>[\s\S]*?<\/a>)/, '$1 <a class="back language-link" href="/en/privacy.html">English</a>');
}
function appEnglishHtml(html) {
  html=html.replace('<html lang="es"','<html lang="en"')
    .replace('href="./manifest.webmanifest"','href="./manifest.en.webmanifest"')
    .replace('content="auto"','content="en"')
    .replace('content="es_ES"','content="en_US"')
    .replace('<title>Prisma Space — Crea, convierte y experimenta</title>','<title>Prisma Space — Create, convert and explore</title>')
    .replace('content="Prisma Space — Crea, convierte y experimenta"','content="Prisma Space — Create, convert and explore"')
    .replace('content="Prisma Space reúne herramientas digitales, procesamiento local e inteligencia artificial para crear, convertir, optimizar y experimentar en un solo lugar."','content="Prisma Space brings together digital tools, local processing, and artificial intelligence to create, convert, optimize, and explore in one place."')
    .replace('content="Crea, convierte, optimiza y experimenta con IA en un solo lugar."','content="Create, convert, optimize, and explore with AI in one place."')
    .replace(/<link rel="canonical" href="[^"]*">/,'<link rel="canonical" href="'+BASE+'/en/">')
    .replace(/<meta property="og:url" content="[^"]*">/,'<meta property="og:url" content="'+BASE+'/en/">');
  if (!html.includes('name="prisma-default-language"')) html=html.replace('<head>','<head><meta name="prisma-default-language" content="en">');
  const tags=alternateTags(BASE+'/',BASE+'/en/');
  if (!html.includes('hreflang="en"')) html=html.replace('</head>',tags+'\n</head>');
  return html;
}
export async function generateInternationalPages(output) {
  const sourcePages=JSON.parse(await readFile(new URL('./pages.json',import.meta.url),'utf8')).pages;
  const englishPages=JSON.parse(await readFile(new URL('./pages.en.json',import.meta.url),'utf8')).pages;
  const sourceHubs={
    categories:JSON.parse(await readFile(new URL('./content-categories.json',import.meta.url),'utf8')).categories,
    solutions:JSON.parse(await readFile(new URL('./content-solutions.json',import.meta.url),'utf8')).solutions,
    guides:JSON.parse(await readFile(new URL('./content-guides.json',import.meta.url),'utf8')).guides
  };
  const hubs=JSON.parse(await readFile(new URL('./content-hubs.en.json',import.meta.url),'utf8'));
  if (englishPages.length!==sourcePages.length) throw new Error('i18n: English tool page count does not match Spanish source.');
  const englishBySource=new Map(englishPages.map(page=>[page.sourceSlug,page]));
  if (englishBySource.size!==sourcePages.length) throw new Error('i18n: duplicate English source tool slug.');
  for (const page of sourcePages) {
    const english=englishBySource.get(page.slug);
    if (!english || english.tool!==page.tool || (english.format||'')!==(page.format||'')) throw new Error('i18n: missing or mismatched English tool page for '+page.slug);
  }
  for (const key of ['categories','solutions','guides']) {
    if (!Array.isArray(hubs[key]) || hubs[key].length!==sourceHubs[key].length) throw new Error('i18n: invalid English hub set '+key);
    const map=new Map(hubs[key].map(item=>[item.sourceSlug,item]));
    if (map.size!==sourceHubs[key].length || sourceHubs[key].some(item=>!map.has(item.slug))) throw new Error('i18n: source mapping mismatch for '+key);
  }
  const uniqueCheck=(items,label)=>{
    const slugs=items.map(item=>item.englishSlug);
    if(slugs.some(slug=>! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) || new Set(slugs).size!==slugs.length) throw new Error('i18n: invalid or duplicate English slugs in '+label);
  };
  uniqueCheck(englishPages,'tools');uniqueCheck(hubs.categories,'categories');uniqueCheck(hubs.solutions,'solutions');uniqueCheck(hubs.guides,'guides');
  const pageByTool=new Map();
  for (const page of englishPages) if (!pageByTool.has(page.tool)) pageByTool.set(page.tool,page);
  const categoryLookup=new Map(hubs.categories.map(item=>[item.sourceSlug,item]));
  const solutionLookup=new Map(hubs.solutions.map(item=>[item.sourceSlug,item]));
  const guideLookup=new Map(hubs.guides.map(item=>[item.sourceSlug,item]));
  const enDir=new URL('en/',output);
  await mkdir(enDir,{recursive:true});
  const appHtml=await readFile(new URL('../index.html',import.meta.url),'utf8');
  await writeFile(new URL('index.html',enDir),appEnglishHtml(appHtml),'utf8');
  const privacyHtml=await readFile(new URL('../privacy.en.html',import.meta.url),'utf8');
  await writeFile(new URL('privacy.html',enDir),privacyHtml,'utf8');
  const englishManifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  englishManifest.id='/en/';
  englishManifest.name='Prisma Space · Your AI workspace';
  englishManifest.short_name='Prisma Space';
  englishManifest.description='Create, transform, and get things done with Prisma Core and digital tools.';
  englishManifest.start_url='/en/?source=pwa';
  englishManifest.scope='/';
  englishManifest.lang='en';
  englishManifest.shortcuts=[
    {name:'Prisma Core',short_name:'Core',url:'/en/?view=core',description:'Chat with Prisma'},
    {name:'Tools',url:'/en/?view=explore',description:'Explore tools'}
  ];
  await writeFile(new URL('manifest.en.webmanifest',output),JSON.stringify(englishManifest,null,2)+'\n','utf8');
  const toolsDir=new URL('en/tools/',output);
  await mkdir(toolsDir,{recursive:true});
  for(const page of englishPages) {
    const folder=new URL(page.englishSlug+'/',toolsDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),toolLanding(page,englishPages,toolMap),'utf8');
  }
  await writeFile(new URL('index.html',toolsDir),directory(englishPages,toolMap),'utf8');
  const categoriesDir=new URL('en/categories/',output);
  await mkdir(categoriesDir,{recursive:true});
  for(const category of hubs.categories) {
    const folder=new URL(category.englishSlug+'/',categoriesDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),categoryPage(category,englishPages,toolMap,solutionLookup,guideLookup),'utf8');
  }
  await writeFile(new URL('index.html',categoriesDir),hubIndex('Categories','Online tool categories | Prisma Space','Browse Prisma Space tools by topic, including PDFs, images, AI, audio, video, text, data, privacy, and study.',BASE+'/en/categories/',hubs.categories,'/en/categories/',BASE+'/categorias/'),'utf8');
  const solutionsDir=new URL('en/solutions/',output);
  await mkdir(solutionsDir,{recursive:true});
  for(const solution of hubs.solutions) {
    const folder=new URL(solution.englishSlug+'/',solutionsDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),solutionPage(solution,englishPages,pageByTool,toolMap,categoryLookup,guideLookup),'utf8');
  }
  await writeFile(new URL('index.html',solutionsDir),hubIndex('Solutions','Practical workflows and solutions | Prisma Space','Follow practical step-by-step workflows that combine Prisma Space tools to complete everyday tasks.',BASE+'/en/solutions/',hubs.solutions,'/en/solutions/',BASE+'/soluciones/'),'utf8');
  const guidesDir=new URL('en/guides/',output);
  await mkdir(guidesDir,{recursive:true});
  for(const guide of hubs.guides) {
    const folder=new URL(guide.englishSlug+'/',guidesDir);
    await mkdir(folder,{recursive:true});
    await writeFile(new URL('index.html',folder),guidePage(guide,englishPages,pageByTool,toolMap,solutionLookup),'utf8');
  }
  await writeFile(new URL('index.html',guidesDir),hubIndex('Guides','How-to guides and tutorials | Prisma Space','Learn how to use Prisma Space tools with practical guides for documents, images, data, study, audio, and video.',BASE+'/en/guides/',hubs.guides,'/en/guides/',BASE+'/guias/'),'utf8');

  const englishUrlBySpanish=new Map([
    [BASE+'/',BASE+'/en/'],
    [BASE+'/herramientas/',BASE+'/en/tools/'],
    [BASE+'/categorias/',BASE+'/en/categories/'],
    [BASE+'/soluciones/',BASE+'/en/solutions/'],
    [BASE+'/guias/',BASE+'/en/guides/'],
    [BASE+'/privacy.html',BASE+'/en/privacy.html']
  ]);
  for(const page of englishPages) englishUrlBySpanish.set(BASE+'/herramientas/'+page.sourceSlug+'/',BASE+'/en/tools/'+page.englishSlug+'/');
  for(const item of hubs.categories) englishUrlBySpanish.set(BASE+'/categorias/'+item.sourceSlug+'/',BASE+'/en/categories/'+item.englishSlug+'/');
  for(const item of hubs.solutions) englishUrlBySpanish.set(BASE+'/soluciones/'+item.sourceSlug+'/',BASE+'/en/solutions/'+item.englishSlug+'/');
  for(const item of hubs.guides) englishUrlBySpanish.set(BASE+'/guias/'+item.sourceSlug+'/',BASE+'/en/guides/'+item.englishSlug+'/');

  const sitemapPath=new URL('sitemap.xml',output);
  const oldSitemap=await readFile(sitemapPath,'utf8');
  const spanishUrls=[...oldSitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]);
  if(!spanishUrls.length) throw new Error('i18n: original sitemap is empty.');
  const missing=spanishUrls.filter(url=>!englishUrlBySpanish.has(url));
  if(missing.length) throw new Error('i18n: English counterpart missing for '+missing.slice(0,8).join(', '));
  const urls=[];
  for(const esUrl of spanishUrls) {
    const enUrl=englishUrlBySpanish.get(esUrl);
    urls.push({loc:esUrl,es:esUrl,en:enUrl});
    urls.push({loc:enUrl,es:esUrl,en:enUrl});
    const esFile=localFile(esUrl,output);
    let html=await readFile(esFile,'utf8');
    html=injectAlternates(html,esUrl,enUrl);
    if(esUrl===BASE+'/privacy.html') html=injectSpanishPrivacyLink(html);
    await writeFile(esFile,html,'utf8');
  }
  const xhtml='xmlns:xhtml="http://www.w3.org/1999/xhtml"';
  const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '+xhtml+'>\n'+
    urls.map(item=>'  <url><loc>'+esc(item.loc)+'</loc><xhtml:link rel="alternate" hreflang="es" href="'+esc(item.es)+'"/><xhtml:link rel="alternate" hreflang="en" href="'+esc(item.en)+'"/><xhtml:link rel="alternate" hreflang="x-default" href="'+esc(item.es)+'"/></url>').join('\n')+
    '\n</urlset>\n';
  await writeFile(sitemapPath,sitemap,'utf8');
  console.log('PRISMA i18n: generated '+englishPages.length+' English tool pages, '+hubs.categories.length+' categories, '+hubs.solutions.length+' solutions, '+hubs.guides.length+' guides; '+urls.length+' bilingual sitemap URLs.');
  return {spanishUrls:spanishUrls.length,totalUrls:urls.length,englishToolPages:englishPages.length};
}
