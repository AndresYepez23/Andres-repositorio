import { runTool } from './engines.js';

export const workflows = [
  { id:'image-pipeline', name:'Optimizar una imagen', description:'Quita el fondo, ajusta el tamaño y comprime el resultado sin saltar entre herramientas.', icon:'image', tag:'Procesamiento local', file:true, multiple:false, accept:'image/*' },
  { id:'document-pipeline', name:'Preparar documentos PDF', description:'Combina archivos, numera páginas y extrae el texto disponible en un solo proceso.', icon:'files', tag:'PDF · Local', file:true, multiple:true, maxFiles:12, accept:'.pdf,application/pdf' },
  { id:'ai-creation', name:'Crear contenido con IA', description:'Convierte una idea en una imagen editada y un paquete de contenido listo para publicar.', icon:'sparkles', tag:'Motores intercambiables', file:false, multiple:false, accept:'*/*' },
  { id:'ai-task', name:'Resolver una tarea con IA', description:'Redacta, resume, explica, traduce o convierte una idea en un resultado útil. Prisma elige el motor conectado.', icon:'brain-circuit', tag:'Enrutamiento automático', file:false, multiple:false, accept:'*/*' }
];

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
  if (params.removeBg) tasks.push({ id:'image-bg', params:{}, label:'Eliminando el fondo' });
  if (params.resize) tasks.push({ id:'image-resize', params:{ width:params.width||1200, height:params.height||1200, keep:true, format:'image/png' }, label:'Ajustando dimensiones' });
  if (params.addWatermark) tasks.push({ id:'image-watermark', params:{ watermark:params.watermark||'Prisma Space', position:params.watermarkPosition||'bottom-right', size:30, opacity:42, color:'#ffffff' }, label:'Aplicando marca de agua' });
  if (params.compress) tasks.push({ id:'image-compress', params:{ quality:params.quality||82, format:params.format||'image/webp' }, label:'Optimizando peso' });
  if (!tasks.length) return { artifacts:[{ name:source.name, filename:source.name, blob:source, previewUrl:URL.createObjectURL(source), type:source.type }], summary:'No seleccionaste transformaciones. Se preparó una copia del archivo original.', steps:['Archivo original preparado'] };

  let currentFile=source,lastResult=null;
  const completed=[];
  for(let index=0;index<tasks.length;index++){
    const task=tasks[index],start=index/tasks.length,span=1/tasks.length;
    const result=await runStep(task.id,[currentFile],task.params,callback,start,span,task.label);
    if(!result?.blob)throw new Error('No se pudo completar: '+task.label.toLowerCase()+'.');
    if(lastResult?.previewUrl?.startsWith('blob:'))URL.revokeObjectURL(lastResult.previewUrl);
    currentFile=asFile(result,'prisma-imagen-'+(index+1)+'.png');lastResult=result;completed.push(task.label);
  }
  callback?.(1,'Imagen optimizada. Preparando descarga...');
  return { artifacts:[{ name:'Imagen optimizada', filename:lastResult.filename||'prisma-imagen-optimizada.webp', blob:lastResult.blob, previewUrl:lastResult.previewUrl, type:lastResult.blob.type }], summary:completed.join(' · ')+'. El archivo final está listo para descargar.', steps:completed };
}

async function documentPipeline(files, params, callback) {
  if(!files.length)throw new Error('Selecciona al menos un PDF.');
  const shouldMerge=!!params.merge&&files.length>1,documents=[],warnings=[],artifacts=[];
  const documentCount=shouldMerge?1:files.length;
  const plannedSteps=(shouldMerge?1:0)+documentCount*((params.numberPages?1:0)+(params.extractText?1:0));
  const totalSteps=Math.max(1,plannedSteps);let stepIndex=0;
  const step=async(id,inputFiles,stepParams,label)=>{
    const start=stepIndex/totalSteps,span=1/totalSteps;stepIndex++;
    return runStep(id,inputFiles,stepParams,callback,start,span,label);
  };
  if(shouldMerge){const merged=await step('pdf-merge',files,{},'Uniendo documentos PDF');documents.push(asFile(merged,'documento-unido.pdf'));}
  else documents.push(...files);

  for(let index=0;index<documents.length;index++){
    let currentFile=documents[index];const baseName=currentFile.name.replace(/\.pdf$/i,'')||'documento';
    if(params.numberPages){const numbered=await step('pdf-page-numbers',[currentFile],{position:params.position||'bottom'},'Numerando páginas');currentFile=asFile(numbered,baseName+'-numerado.pdf');}
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
  return { artifacts, summary:artifacts.filter(item=>item.type==='application/pdf').length+' PDF preparado(s).'+(artifacts.some(item=>item.type==='text/plain')?' También se generó texto extraído.':'')+(warnings.length?' '+warnings.join(' '):''), steps:[...(shouldMerge?['Documentos combinados']:[]),...(params.numberPages?['Páginas numeradas']:[]),...(params.extractText?['Extracción de texto intentada']:[])], warnings };
}

function localContentPack(prompt,style){
  const clean=String(prompt||'').trim().replace(/\s+/g,' ');
  const short=clean.length>78?clean.slice(0,75).trim()+'…':clean;
  const keywords=clean.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(word=>word.length>4).slice(0,4);
  const hashtags=['#PrismaSpace','#CreacionDigital','#DisenoVisual',...keywords.map(word=>'#'+word)];
  return ['TÍTULO',short.charAt(0).toLocaleUpperCase('es')+short.slice(1),'','DESCRIPCIÓN','Una idea convertida en una pieza visual. '+clean+'. Creada con Prisma Space'+(style?' · Estilo '+style:'')+'.','','HASHTAGS',[...new Set(hashtags)].join(' '),'','TEXTO ALTERNATIVO','Imagen de '+clean+'.'].join('\n');
}

async function generateContentPack(tokens,prompt,style,params,callback){
  const instruction='Prepara contenido para publicar una imagen creada a partir de esta idea: "'+prompt+'". Devuelve exactamente cuatro secciones en español: TÍTULO (breve y atractivo), DESCRIPCIÓN (2 frases naturales), HASHTAGS (entre 4 y 7, relevantes y sin repetir) y TEXTO ALTERNATIVO (accesible, descriptivo y sin exageraciones). Estilo visual: '+style+'. No inventes marcas, cifras ni características que no aparezcan en la idea.';
  const preferred=params.textProvider||'auto';
  const candidates=preferred==='auto'?['groq','huggingface','gemini','pollinations']:[preferred];
  const labels={pollinations:'Pollinations',huggingface:'Hugging Face',groq:'Groq',gemini:'Google Gemini'};
  const errors=[];
  for(const provider of candidates){
    const available=provider==='pollinations'?!!tokens.pollinations:provider==='huggingface'?!!tokens.huggingface:provider==='gemini'?!!tokens.gemini:!!tokens.groq;
    if(!available)continue;
    try{
      const result=await runStep('ai-assistant',[],{
        prompt:instruction,provider,tone:'creative',length:'medium',
        polliToken:tokens.pollinations,hfToken:tokens.huggingface,
        geminiKey:tokens.gemini,groqKey:tokens.groq
      },callback,.82,.17,'Preparando título, descripción y hashtags');
      if(result?.text?.trim())return {text:result.text.trim(),source:labels[provider]};
      throw new Error('El motor no devolvió contenido.');
    }catch(error){
      errors.push(labels[provider]+': '+(error?.message||'error de generación'));
      if(preferred!=='auto')throw error;
    }
  }
  return {text:localContentPack(prompt,style),source:'Plantilla local',warning:errors.length?errors.join(' | '):'No hay un motor de texto conectado.'};
}

async function aiCreation(files,params,callback){
  const prompt=String(params.prompt||'').trim();
  if(prompt.length<8)throw new Error('Describe tu idea con al menos ocho caracteres.');
  const tokens={
    pollinations:String(params.polliToken||'').trim(),
    huggingface:String(params.hfToken||'').trim(),
    gemini:String(params.geminiKey||'').trim(),
    groq:String(params.groqKey||'').trim()
  };
  const preferred=params.provider||'auto';
  const candidates=preferred==='auto'?['pollinations','huggingface','gemini']:[preferred];
  const available={
    pollinations:!!tokens.pollinations,
    huggingface:!!tokens.huggingface,
    gemini:!!tokens.gemini
  };
  const providersToTry=candidates.filter(provider=>available[provider]);
  if(!providersToTry.length){
    if(preferred!=='auto')throw new Error('Conecta '+(preferred==='gemini'?'Google Gemini':preferred==='huggingface'?'Hugging Face':'Pollinations')+' desde el Laboratorio IA.');
    throw new Error('Conecta al menos un motor de imágenes: Pollinations, Hugging Face o Google Gemini.');
  }

  const errors=[];
  let generated=null,providerUsed='';
  for(let index=0;index<providersToTry.length;index++){
    const provider=providersToTry[index];
    try{
      callback?.(.08+index*.06,'Conectando con '+(provider==='pollinations'?'Pollinations':provider==='huggingface'?'Hugging Face':'Google Gemini')+'...');
      generated=await runStep('image-gen',[],{
        provider,qualityProfile:params.qualityProfile||'balanced',
        prompt,style:params.style||'photo',ratio:params.ratio||'square',
        negativePrompt:params.negativePrompt||'',seed:params.seed||'',
        polliToken:tokens.pollinations,hfToken:tokens.huggingface,geminiKey:tokens.gemini
      },callback,.12,.56,'Generando imagen');
      providerUsed=provider;
      break;
    }catch(error){
      errors.push((provider==='pollinations'?'Pollinations':provider==='huggingface'?'Hugging Face':'Google Gemini')+': '+(error?.message||'error de generación'));
      if(!params.allowFallback||preferred!=='auto')throw error;
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
  const content=await generateContentPack(tokens,prompt,params.style||'photo',params,callback);
  const contentBlob=new Blob([content.text],{type:'text/plain;charset=utf-8'});
  callback?.(1,'Imagen y contenido preparados.');
  const providerNames={pollinations:'Pollinations Connect',huggingface:'Hugging Face',gemini:'Google Gemini'};
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
  const tokens={
    polliToken:String(params.polliToken||'').trim(),
    hfToken:String(params.hfToken||'').trim(),
    geminiKey:String(params.geminiKey||'').trim(),
    groqKey:String(params.groqKey||'').trim()
  };
  const taskLabels={write:'Redactar',summarize:'Resumir',explain:'Explicar',translate:'Traducir',ideas:'Generar ideas',improve:'Mejorar un texto'};
  const instruction='Actúa como un asistente experto y resuelve esta tarea. Tipo de tarea: '+(taskLabels[params.task]||'Resolver')+'.\n\nSolicitud del usuario:\n'+prompt+'\n\nContexto adicional:\n'+String(params.context||'No proporcionado')+'\n\nResponde en español claro, con estructura útil y sin inventar datos. Si falta información, indícalo. No describas pasos internos ni inventes fuentes.';
  const result=await runStep('ai-assistant',[],{
    prompt:instruction,
    provider:params.provider||'auto',
    tone:params.tone||'professional',
    length:params.length||'medium',
    polliToken:tokens.polliToken,
    hfToken:tokens.hfToken,
    geminiKey:tokens.geminiKey,
    groqKey:tokens.groqKey
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

export async function runWorkflow(id,files=[],params={},callback){
  callback?.(.02,'Preparando flujo inteligente...');
  if(id==='image-pipeline')return imagePipeline(files,params,callback);
  if(id==='document-pipeline')return documentPipeline(files,params,callback);
  if(id==='ai-creation')return aiCreation(files,params,callback);
  if(id==='ai-task')return aiTask(params,callback);
  throw new Error('No reconocemos ese flujo de trabajo.');
}
