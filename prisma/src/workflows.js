import { runTool } from './engines.js';
import { workflowCatalog } from './workflow-catalog.js';

export const workflows = workflowCatalog;

const asFile = (result, fallbackName) => {
  if (!result?.blob) throw new Error('El paso anterior no produjo un archivo utilizable.');
  return new File([result.blob], result.filename || fallbackName, { type: result.blob.type || 'application/octet-stream' });
};
const report = (callback, start, span, progress, message) => callback?.(Math.min(1, start + span * Math.max(0, Math.min(1, Number(progress) || 0))), message);
async function runStep(id, files, params, callback, start, span, label) {
  return runTool(id, files, params, (progress, message) => report(callback, start, span, progress, message || label));
}

async function imagePipeline(files, params, callback) {
  const source = files[0];
  if (!source) throw new Error('Selecciona una imagen para comenzar.');
  const tasks = [];
  if(params.stripMetadata)tasks.push({id:'image-strip-metadata',params:{},label:'Retirando metadatos de origen'});
  if (params.removeBg) tasks.push({ id:'image-bg', params:{}, label:'Eliminando el fondo' });
  if (params.resize) tasks.push({ id:'image-resize', params:{ width:params.width||1200, height:params.height||1200, keep:true, format:'image/png' }, label:'Ajustando dimensiones' });
  if (params.addWatermark) tasks.push({ id:'image-watermark', params:{ watermark:params.watermark||'Prisma Space', position:params.watermarkPosition||'bottom-right', size:30, opacity:42, color:'#ffffff' }, label:'Aplicando marca de agua' });
  if (params.compress) tasks.push({ id:'image-compress', params:{ quality:params.quality||82, format:params.format||'image/webp' }, label:'Optimizando peso' });
  if (!tasks.length) return { artifacts:[{ name:source.name, filename:source.name, blob:source, previewUrl:URL.createObjectURL(source), type:source.type }], summary:'No seleccionaste transformaciones. Se preparó una copia del archivo original.', steps:['Archivo original preparado'] };

  let currentFile=source,lastResult=null;
  const completed=[],warnings=[];
  for(let index=0;index<tasks.length;index++){
    const task=tasks[index],start=index/tasks.length,span=1/tasks.length;
    try{
      const result=await runStep(task.id,[currentFile],task.params,callback,start,span,task.label);
      if(!result?.blob)throw new Error('La herramienta no devolvió un archivo válido.');
      if(lastResult?.previewUrl?.startsWith('blob:'))URL.revokeObjectURL(lastResult.previewUrl);
      currentFile=asFile(result,'prisma-imagen-'+(index+1)+'.png');lastResult=result;completed.push(task.label);
    }catch(error){
      // Background removal downloads a large browser model; its failure must
      // not destroy safe local resize/compression work on a low-memory phone.
      if(task.id!=='image-bg')throw new Error('No se pudo completar '+task.label.toLowerCase()+': '+(error?.message||'error')+'.');
      warnings.push('No fue posible eliminar el fondo en este dispositivo: '+(error?.message||'modelo local no disponible')+'. Se conservará la imagen y continuarán las demás operaciones.');
    }
  }
  callback?.(1,'Imagen optimizada. Preparando descarga...');
  const final=lastResult||{blob:source,filename:source.name,type:source.type};
  return {artifacts:[{name:'Imagen optimizada',filename:final.filename||'prisma-imagen-optimizada.webp',blob:final.blob,previewUrl:final.previewUrl,type:final.blob.type}],summary:(completed.length?completed.join(' · '):'Archivo original conservado')+'. El archivo final está listo para descargar.'+(warnings.length?' Algunas tareas no se pudieron completar; revisa los avisos.':''),steps:completed,warnings};
}

async function documentPipeline(files, params, callback) {
  if(!files.length)throw new Error('Selecciona al menos un PDF.');
  const shouldMerge=!!params.merge&&files.length>1,documents=[],warnings=[],artifacts=[];
  const documentCount=shouldMerge?1:files.length;
  const plannedSteps=(shouldMerge?1:0)+documentCount*((params.pages?.trim()?1:0)+(params.numberPages?1:0)+(params.watermark?.trim()?1:0)+(params.extractText?1:0));
  const totalSteps=Math.max(1,plannedSteps);let stepIndex=0;
  const step=async(id,inputFiles,stepParams,label)=>{
    const start=stepIndex/totalSteps,span=1/totalSteps;stepIndex++;
    return runStep(id,inputFiles,stepParams,callback,start,span,label);
  };
  if(shouldMerge){const merged=await step('pdf-merge',files,{},'Uniendo documentos PDF');documents.push(asFile(merged,'documento-unido.pdf'));}
  else documents.push(...files);

  for(let index=0;index<documents.length;index++){
    let currentFile=documents[index];const baseName=currentFile.name.replace(/\.pdf$/i,'')||'documento';
    if(params.pages?.trim()){
      const extracted=await step('pdf-extract',[currentFile],{pages:params.pages.trim()},'Seleccionando páginas');
      currentFile=asFile(extracted,baseName+'-paginas.pdf');
    }
    if(params.numberPages){const numbered=await step('pdf-page-numbers',[currentFile],{position:params.position||'bottom'},'Numerando páginas');currentFile=asFile(numbered,baseName+'-numerado.pdf');}
    if(params.watermark?.trim()){
      const marked=await step('pdf-watermark',[currentFile],{watermark:params.watermark.trim()},'Aplicando marca de agua');
      currentFile=asFile(marked,baseName+'-marcado.pdf');
    }
    artifacts.push({name:documents.length>1?'PDF '+(index+1):'Documento PDF',filename:currentFile.name,blob:currentFile,type:'application/pdf'});
    if(params.extractText){
      try{
        const extracted=await step('pdf-text',[currentFile],{},'Extrayendo texto del documento');
        if(extracted?.text?.trim()){
          const textBlob=new Blob([extracted.text],{type:'text/plain;charset=utf-8'});
          artifacts.push({name:'Texto extraído · '+(index+1),filename:baseName+'-texto.txt',blob:textBlob,type:'text/plain',text:extracted.text});
        }else warnings.push(baseName+': no se encontró texto seleccionable. Si es un escaneo, necesitará OCR.');
      }catch(error){warnings.push(baseName+': no se pudo extraer texto ('+(error?.message||'error de lectura')+').');}
    }
  }
  callback?.(1,'Documentos preparados.');
  return { artifacts, summary:artifacts.filter(item=>item.type==='application/pdf').length+' PDF preparado(s).'+(artifacts.some(item=>item.type==='text/plain')?' También se generó texto extraído.':'')+(warnings.length?' '+warnings.join(' '):''), steps:[...(shouldMerge?['Documentos combinados']:[]),...(params.pages?.trim()?['Páginas específicas extraídas']:[]),...(params.numberPages?['Páginas numeradas']:[]),...(params.watermark?.trim()?['Marca de agua aplicada']:[]),...(params.extractText?['Extracción de texto intentada']:[])], warnings };
}

function localContentPack(prompt,style){
  const clean=String(prompt||'').trim().replace(/\s+/g,' ');
  const short=clean.length>78?clean.slice(0,75).trim()+'…':clean;
  const keywords=clean.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(word=>word.length>4).slice(0,4);
  const hashtags=['#PrismaSpace','#CreacionDigital','#DisenoVisual',...keywords.map(word=>'#'+word)];
  return ['TÍTULO',short.charAt(0).toLocaleUpperCase('es')+short.slice(1),'','DESCRIPCIÓN','Una idea convertida en una pieza visual. '+clean+'. Creada con Prisma Space'+(style?' · Estilo '+style:'')+'.','','HASHTAGS',[...new Set(hashtags)].join(' '),'','TEXTO ALTERNATIVO','Imagen de '+clean+'.'].join('\n');
}

async function generateContentPack(params,prompt,style,callback){
 const instruction='Crea contenido listo para publicar a partir de esta idea: '+prompt+
  '\nEstilo visual: '+style+
  '\nEntrega TÍTULO (breve), DESCRIPCIÓN (dos frases), HASHTAGS (4 a 7) y TEXTO ALTERNATIVO accesible. No inventes marcas, precios ni hechos no proporcionados.';
 try{
  const result=await runStep('ai-assistant',[],{
   ...params,prompt:instruction,provider:params.textProvider||'auto',
   task:'creative',tone:'creative',length:'medium',reasoning:'balanced'
  },callback,.82,.17,'Creando título, descripción y hashtags');
  if(!result?.text?.trim())throw new Error('El motor no devolvió contenido.');
  return {text:result.text.trim(),source:result.provider||'IA'};
 }catch(error){
  return {text:localContentPack(prompt,style),source:'Plantilla local',warning:'El texto IA no estuvo disponible: '+(error?.message||'error')};
 }
}

async function aiCreation(files,params,callback){
  const prompt=String(params.prompt||'').trim();
  if(prompt.length<8)throw new Error('Describe tu idea con al menos ocho caracteres.');
  const central=params.centralProviders||{};
  const available={
   cloudflare:!!central.cloudflare,
   pollinations:!!(central.pollinations||params.polliToken),
   huggingface:!!params.centralFeatures?.huggingfaceImages
  };
  const preferred=params.provider||'auto';
  if(preferred==='gemini')throw new Error('La generación de imágenes con Gemini no está conectada todavía. Usa Cloudflare o Pollinations.');
  const candidates=preferred==='auto'
   ? ['cloudflare','pollinations','huggingface']
   : [preferred,...(params.allowFallback?['cloudflare','pollinations','huggingface'].filter(x=>x!==preferred):[])];
  const providersToTry=candidates.filter(provider=>available[provider]);
  if(!providersToTry.length)throw new Error('No hay un motor de imágenes disponible. Revisa Cloudflare o Pollinations central en Laboratorio IA.');

  const errors=[];
  let generated=null,providerUsed='';
  for(let index=0;index<providersToTry.length;index++){
    const provider=providersToTry[index];
    try{
      callback?.(.08+index*.06,'Conectando con '+({pollinations:'Pollinations',huggingface:'Hugging Face',cloudflare:'Cloudflare'}[provider]||provider)+'…');
      generated=await runStep('image-gen',[],{
        ...params,
        provider,qualityProfile:params.qualityProfile||'balanced',
        prompt,style:params.style||'photo',ratio:params.ratio||'square',
        negativePrompt:params.negativePrompt||'',seed:params.seed||''
      },callback,.12,.56,'Generando imagen');
      providerUsed=provider;
      break;
    }catch(error){
      errors.push(provider+': '+(error?.message||'error de generación'));
      if(preferred!=='auto'&&!params.allowFallback)throw error;
    }
  }
  if(!generated?.blob)throw new Error('No fue posible generar la imagen. '+errors.join(' | '));

  let currentFile=asFile(generated,'prisma-imagen-generada.png'),finalImage=generated;
  const editTasks=[];
  if(params.resize)editTasks.push({id:'image-resize',params:{width:params.width||1200,height:params.height||1200,keep:true,format:'image/png'},label:'Ajustando imagen'});
  if(params.addWatermark)editTasks.push({id:'image-watermark',params:{watermark:params.watermark||'Prisma Space',position:params.watermarkPosition||'bottom-right',size:30,opacity:42,color:'#ffffff'},label:'Añadiendo marca de agua'});
  if(params.compress)editTasks.push({id:'image-compress',params:{quality:params.quality||86,format:params.format||'image/webp'},label:'Optimizando archivo'});
  for(let index=0;index<editTasks.length;index++){
    const task=editTasks[index],start=.68+(index/Math.max(1,editTasks.length))*.13,span=.13/Math.max(1,editTasks.length);
    const result=await runStep(task.id,[currentFile],task.params,callback,start,span,task.label);
    if(finalImage?.previewUrl?.startsWith('blob:'))URL.revokeObjectURL(finalImage.previewUrl);
    finalImage=result;currentFile=asFile(result,'prisma-imagen-editada.webp');
  }
  const content=await generateContentPack(params,prompt,params.style||'photo',callback);
  const contentBlob=new Blob([content.text],{type:'text/plain;charset=utf-8'});
  callback?.(1,'Imagen y contenido preparados.');
  const providerNames={pollinations:'Pollinations',huggingface:'Hugging Face',cloudflare:'Cloudflare Workers AI'};
  return {
    artifacts:[
      {name:'Imagen lista para publicar',filename:finalImage.filename||'prisma-imagen-final.webp',blob:finalImage.blob,previewUrl:finalImage.previewUrl,type:finalImage.blob.type},
      {name:'Paquete de contenido',filename:'prisma-contenido-para-publicar.txt',blob:contentBlob,text:content.text,type:'text/plain'}
    ],
    summary:'Imagen generada con '+providerNames[providerUsed]+'. Texto preparado con '+content.source+'.'+(content.warning?' No respondió un motor de texto; se utilizó una plantilla local.':'')+(errors.length?' Se cambió a otro motor conectado después de un fallo.':''),
    steps:['Idea interpretada','Imagen generada',...editTasks.map(task=>task.label),'Contenido preparado'],
    warnings:[...errors,...(content.warning?[content.warning]:[])]
  };
}

async function aiTask(params,callback){
  const prompt=String(params.prompt||'').trim();
  if(prompt.length<5)throw new Error('Cuéntanos qué necesitas resolver.');
  const taskLabels={write:'Redactar',summarize:'Resumir',explain:'Explicar',translate:'Traducir',ideas:'Generar ideas',improve:'Mejorar un texto'};
  const instruction='Actúa como un asistente experto y resuelve esta tarea. Tipo de tarea: '+(taskLabels[params.task]||'Resolver')+'.\n\nSolicitud del usuario:\n'+prompt+'\n\nContexto adicional:\n'+String(params.context||'No proporcionado')+'\n\nResponde en español claro, con estructura útil y sin inventar datos. Si falta información, indícalo. No describas pasos internos ni inventes fuentes.';
  const result=await runStep('ai-assistant',[],{
    ...params,
    prompt:instruction,
    provider:params.provider||'auto',
    tone:params.tone||'professional',
    length:params.length||'medium',
    task:params.task==='summarize'?'summary':params.task==='explain'?'reasoning':params.task==='ideas'?'creative':'general'
  },callback,.05,.9,'Resolviendo tu solicitud con el mejor motor disponible');
  const answer=String(result?.text||'').trim();
  if(!answer)throw new Error('El motor conectado no devolvió una respuesta. Prueba con otro proveedor.');
  const blob=new Blob([answer],{type:'text/plain;charset=utf-8'});
  callback?.(1,'Tu resultado está listo.');
  return {
    artifacts:[{name:'Resultado de tu tarea',filename:'prisma-resultado-ia.txt',blob,text:answer,type:'text/plain'}],
    summary:'Tarea completada con el motor de IA disponible. Puedes copiar la respuesta o descargarla.',
    steps:['Solicitud interpretada','Motor de IA seleccionado','Respuesta preparada']
  };
}

function textArtifact(name,filename,text){
 const content=String(text||'').trim();
 return {name,filename,text:content,blob:new Blob([content],{type:'text/markdown;charset=utf-8'}),type:'text/markdown'};
}
async function songStudio(params,callback){
 const idea=String(params.prompt||'').trim();
 if(idea.length<8)throw new Error('Describe el tema de la canción para comenzar.');
 const briefing='Crea una canción ORIGINAL y cantable para la siguiente idea: '+idea+
  '\nIdioma: '+(params.language||'Español')+'; género: '+(params.genre||'libre')+
  '; emoción: '+(params.mood||'esperanza')+
  '. Incluye título, versos, precoro, coro memorable, puente, final y un prompt técnico breve de producción (instrumentación, tempo y tipo de voz). No copies canciones ni imites exactamente a un artista. No afirmes haber generado audio.';
 const result=await runStep('music-lyrics',[],{...params,prompt:briefing,provider:params.provider||'auto',task:'songwriting',tone:'creative',reasoning:'balanced',length:'long'},callback,.05,.92,'Componiendo letra y dirección musical');
 if(!result?.text?.trim())throw new Error('No se pudo componer la canción.');
 callback?.(1,'Composición preparada.');
 return {artifacts:[textArtifact('Letra y producción','prisma-cancion-original.md',result.text)],summary:'Canción original compuesta con '+(result.provider||'un motor de IA')+'. Se entrega letra y guía de producción; no se generó un archivo musical.',steps:['Idea y género definidos','Letra original escrita','Instrucciones musicales preparadas']};
}
async function creatorStudio(params,callback){
 const topic=String(params.prompt||'').trim();
 if(topic.length<8)throw new Error('Escribe el tema de tu publicación o vídeo.');
 const instruction='Actúa como productor editorial para YouTube y redes. Tema: '+topic+
  '\nPlataforma: '+(params.platform||'YouTube')+'; público: '+(params.audience||'general')+
  '. Entrega 5 títulos atractivos sin sensacionalismo engañoso; una descripción SEO legible; guion o escaleta de apertura, desarrollo y cierre; 7 hashtags pertinentes; propuesta de miniatura con máximo 4 palabras grandes; 3 ideas de clips cortos. No inventes métricas ni promesas de CTR.';
 const result=await runStep('ai-assistant',[],{...params,prompt:instruction,task:'creative',provider:params.provider||'auto',tone:'creative',length:'long',reasoning:'balanced'},callback,.04,.65,'Preparando estrategia y contenido');
 if(!result?.text?.trim())throw new Error('No se pudo crear el paquete editorial.');
 const artifacts=[textArtifact('Plan para redes y YouTube','prisma-kit-creador.md',result.text)];
 const warnings=[];
 if(params.includeImage){
  try{
   const image=await runStep('image-gen',[],{...params,provider:'auto',prompt:'Miniatura profesional de '+topic+'. Composición visual clara, alto contraste, sujeto dominante, espacio para título corto, sin marcas ni texto ilegible.',style:'cinematic',ratio:'wide'},callback,.70,.28,'Generando miniatura opcional');
   if(image?.blob)artifacts.push({name:'Imagen de miniatura',filename:image.filename||'prisma-miniatura.png',blob:image.blob,type:image.blob.type,previewUrl:image.previewUrl});
  }catch(error){warnings.push('La miniatura opcional no se generó: '+(error?.message||'error del motor')+'. Se conserva el kit editorial.');}
 }
 callback?.(1,'Kit de creación preparado.');
 return {artifacts,summary:'Kit editorial creado con '+(result.provider||'IA')+'.'+(warnings.length?' La imagen opcional no estuvo disponible.':''),warnings,steps:['Tema y audiencia definidos','Títulos, guion y descripción preparados',...(params.includeImage?['Generación visual intentada']:[])]};
}
async function studyStudio(params,callback){
 const topic=String(params.prompt||'').trim(),notes=String(params.notes||'').trim();
 if(topic.length<5&&!notes)throw new Error('Escribe un tema o pega tus apuntes.');
 const instruction='Elabora una GUÍA DE ESTUDIO didáctica basada en el tema '+topic+
  (notes?'\nAPUNTES DEL USUARIO:\n'+notes.slice(0,12000):'')+
  '\nIncluye: explicación clara por secciones, términos esenciales, ejemplos, 8 preguntas de práctica con respuestas al final y 10 tarjetas tipo Pregunta — Respuesta para repasar. Distingue datos comprobados de suposiciones; no inventes bibliografía ni citas.';
 const result=await runStep('ai-assistant',[],{...params,prompt:instruction,task:'reasoning',provider:params.provider||'auto',tone:'academic',length:'long',reasoning:'balanced'},callback,.05,.92,'Preparando guía, preguntas y tarjetas');
 if(!result?.text?.trim())throw new Error('No se pudo preparar la guía de estudio.');
 callback?.(1,'Material de estudio listo.');
 return {artifacts:[textArtifact('Guía y preguntas de estudio','prisma-guia-estudio.md',result.text)],summary:'Material de estudio preparado. Revisa los datos importantes con tu docente o bibliografía de referencia.',steps:['Tema y apuntes organizados','Explicación elaborada','Preguntas y tarjetas de repaso generadas']};
}

async function mediaStudio(files,params,callback){
 const file=files[0];if(!file)throw Error('Selecciona un archivo de audio o vídeo.');
 const isVideo=file.type.startsWith('video/')||/\\.(mp4|webm|mov)$/i.test(file.name);
 const mode=params.mode||'thumbnail',artifacts=[],steps=[],warnings=[];
 let current=file;
 const op=async(id,opts,label,start,span)=>{
  const result=await runStep(id,[current],opts,callback,start,span,label);
  steps.push(label);if(result?.blob)current=asFile(result,'prisma-medio-'+steps.length);
  return result;
 };
 if(mode==='thumbnail'){
  if(!isVideo)throw Error('Para obtener un fotograma necesitas un vídeo.');
  const thumb=await op('video-thumbnail',{second:Math.max(0,Number(params.second)||1)},'Capturar fotograma',.03,.64);
  let final=thumb;
  if(params.addWatermark){
   if(!String(params.watermark||'').trim())throw Error('Escribe el texto de la marca de agua.');
   final=await op('image-watermark',{watermark:params.watermark,position:'bottom-right'},'Añadir marca de agua',.67,.3);
  }
  artifacts.push({name:'Miniatura del vídeo',filename:final.filename||'prisma-miniatura.jpg',blob:final.blob,type:final.blob.type,previewUrl:final.previewUrl});
 }else if(mode==='trim'){
  const start=Number(params.start),duration=Number(params.duration);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0)throw Error('Indica el inicio y la duración válidos.');
  const result=await op(isVideo?'video-trim':'audio-trim',{start,duration},'Extraer fragmento',.03,.94);
  artifacts.push({name:'Fragmento preparado',filename:result.filename||current.name,blob:result.blob,type:result.blob.type});
 }else if(mode==='mute'||mode==='extract'){
  if(!isVideo)throw Error('Esta operación requiere un vídeo.');
  const result=await op(mode==='mute'?'video-mute':'video-audio',{},mode==='mute'?'Quitar el sonido':'Extraer el audio',.03,.94);
  artifacts.push({name:'Archivo procesado',filename:result.filename||current.name,blob:result.blob,type:result.blob.type});
 }else if(mode==='transcribe-summary'){
  if(isVideo)await op('video-audio',{},'Extraer audio del vídeo',.03,.28);
  const transcript=await op('ai-transcribe',{...params,provider:params.provider==='auto'?'auto':params.provider||'auto',language:params.language||'auto'},'Transcribir audio',isVideo?.31:.03,isVideo?.36:.65);
  if(!transcript?.text?.trim())throw Error('La transcripción no devolvió texto.');
  const transcriptBlob=new Blob([transcript.text],{type:'text/plain;charset=utf-8'});
  artifacts.push({name:'Transcripción completa',filename:'prisma-transcripcion.txt',blob:transcriptBlob,type:'text/plain',text:transcript.text});
  try{
   const summary=await runStep('ai-assistant',[],{...params,provider:params.textProvider||'auto',task:'summary',prompt:'Resume fielmente esta transcripción. Incluye ideas esenciales y acciones mencionadas. No inventes hechos.\\n\\n'+transcript.text.slice(0,15000),tone:'professional',length:'medium'},callback,.72,.25,'Preparando resumen');
   if(summary?.text?.trim()){
    artifacts.push({name:'Resumen de la transcripción',filename:'prisma-resumen.md',blob:new Blob([summary.text],{type:'text/markdown;charset=utf-8'}),type:'text/markdown',text:summary.text});
    steps.push('Resumen preparado');
   }
  }catch(error){warnings.push('No se pudo preparar el resumen, pero se conserva la transcripción: '+(error?.message||'error'));}
 }else throw Error('No se reconoce la operación de audio o vídeo.');
 callback?.(1,'Resultado listo.');
 return {artifacts,steps,warnings,summary:'Proceso multimedia completado. Los archivos de salida se entregan por separado.'+(warnings.length?' El resumen opcional no estuvo disponible.':'')};
}
async function dataStudio(files,params,callback){
 const file=files[0];if(!file)throw Error('Selecciona un CSV o JSON.');
 if(file.size>5*1024*1024)throw Error('Para esta función selecciona un archivo de hasta 5 MB.');
 const input=await file.text(),mode=params.mode||'audit';
 let result,label;
 if(mode==='audit'){
  if(!/\\.csv$/i.test(file.name)&&!file.type.includes('csv'))throw Error('La auditoría requiere un archivo CSV.');
  result=await runStep('csv-profile-local',[file],{delimiter:params.delimiter||'auto'},callback,.02,.96,'Auditando el CSV');
  label='Auditoría CSV';
 }else if(mode==='csv-json'){
  const delimiter=params.delimiter&&params.delimiter!=='auto'?params.delimiter:
   [',',';','\t'].map(ch=>({ch,count:(input.split(/\r?\n/)[0]||'').split(ch).length-1})).sort((x,y)=>y.count-x.count)[0].ch;
  result=await runStep('csv-json',[],{text:input,delimiter,format:'json'},callback,.02,.96,'Convirtiendo CSV a JSON');
  label='Resultado JSON';
 }else if(mode==='json-csv'){
  result=await runStep('json-csv',[],{text:input},callback,.02,.96,'Convirtiendo JSON a CSV');
  label='Resultado CSV';
 }else throw Error('Operación de datos desconocida.');
 const text=String(result?.text||'');
 const mime=mode==='json-csv'?'text/csv':mode==='csv-json'?'application/json':'text/plain';
 const blob=result.blob||new Blob([text],{type:mime+';charset=utf-8'});
 callback?.(1,'Datos preparados.');
 return {artifacts:[{name:label,filename:result.filename||'prisma-datos.'+(mode==='csv-json'?'json':mode==='json-csv'?'csv':'txt'),blob,type:mime,text}],summary:result.summary||'Archivo procesado localmente.',steps:[label]};
}
async function privacyStudio(files,params,callback){
 const file=files[0];if(!file)throw Error('Selecciona un PDF o imagen.');
 const isPdf=file.type==='application/pdf'||/\\.pdf$/i.test(file.name);
 const clean=await runStep(isPdf?'pdf-metadata-clean':'image-strip-metadata',[file],{},callback,.03,.62,'Limpiando metadatos');
 if(!clean?.blob)throw Error('No se pudo generar el archivo sin metadatos.');
 const steps=['Metadatos habituales retirados'];let final=clean;
 if(params.addWatermark){
  if(!String(params.watermark||'').trim())throw Error('Escribe la marca de agua para el archivo.');
  final=await runStep(isPdf?'pdf-watermark':'image-watermark',[asFile(clean,file.name)],{watermark:params.watermark.trim(),position:'bottom-right'},callback,.65,.33,'Añadiendo marca de agua');
  steps.push('Marca de agua aplicada');
 }
 callback?.(1,'Archivo listo para compartir.');
 return {artifacts:[{name:'Archivo para compartir',filename:final.filename||'prisma-compartir',blob:final.blob,type:final.blob.type,previewUrl:final.previewUrl}],summary:'Copia del archivo preparada localmente. Revisa su contenido antes de compartirlo; esta limpieza no garantiza la eliminación de todo dato sensible incrustado.',steps};
}
export async function runWorkflow(id,files=[],params={},callback){
  callback?.(.02,'Preparando flujo inteligente...');
  if(id==='media-studio')return mediaStudio(files,params,callback);
  if(id==='data-studio')return dataStudio(files,params,callback);
  if(id==='privacy-studio')return privacyStudio(files,params,callback);
  if(id==='image-pipeline')return imagePipeline(files,params,callback);
  if(id==='document-pipeline')return documentPipeline(files,params,callback);
  if(id==='ai-creation')return aiCreation(files,params,callback);
  if(id==='ai-task')return aiTask(params,callback);
  if(id==='song-studio')return songStudio(params,callback);
  if(id==='creator-studio')return creatorStudio(params,callback);
  if(id==='study-studio')return studyStudio(params,callback);
  throw new Error('No reconocemos ese flujo de trabajo.');
}
