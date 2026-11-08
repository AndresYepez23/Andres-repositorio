import { runTool } from './engines.js';

export const workflows = [
  { id:'image-pipeline', name:'Optimizar una imagen', description:'Quita el fondo, ajusta el tamaño y comprime el resultado sin saltar entre herramientas.', icon:'image', tag:'Procesamiento local', file:true, multiple:false, accept:'image/*' },
  { id:'document-pipeline', name:'Preparar documentos PDF', description:'Combina archivos, numera páginas y extrae el texto disponible en un solo proceso.', icon:'files', tag:'PDF · Local', file:true, multiple:true, maxFiles:12, accept:'.pdf,application/pdf' },
  { id:'ai-creation', name:'Crear contenido con IA', description:'Convierte una idea en una imagen editada y un paquete de contenido listo para publicar.', icon:'sparkles', tag:'Motores intercambiables', file:false, multiple:false, accept:'*/*' }
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

async function generateContentPack(provider,tokens,prompt,style,callback){
  const instruction='Prepara contenido para publicar una imagen creada a partir de esta idea: "'+prompt+'". Devuelve exactamente cuatro secciones en español: TÍTULO (breve y atractivo), DESCRIPCIÓN (2 frases naturales), HASHTAGS (entre 4 y 7, relevantes y sin repetir) y TEXTO ALTERNATIVO (accesible, descriptivo y sin exageraciones). Estilo visual: '+style+'. No inventes marcas, cifras ni características que no aparezcan en la idea.';
  try{
    if(provider==='pollinations'&&tokens.pollinations){
      const result=await runTool('ai-assistant',[],{prompt:instruction,model:'openai/gpt-5.4-nano',tone:'creative',length:'medium',polliToken:tokens.pollinations},(progress,message)=>report(callback,.82,.17,progress,message||'Preparando contenido'));
      if(result?.text?.trim())return {text:result.text.trim(),source:'Pollinations'};
    }
    if(provider==='huggingface'&&tokens.huggingface){
      const {InferenceClient}=await import('https://esm.sh/@huggingface/inference');
      const client=new InferenceClient(tokens.huggingface);
      const result=await client.chatCompletion({model:'Qwen/Qwen2.5-7B-Instruct',messages:[{role:'system',content:'Eres un especialista en contenido digital. Escribe en español, con precisión y sin inventar datos.'},{role:'user',content:instruction}],max_tokens:650,temperature:.7});
      const text=result?.choices?.[0]?.message?.content?.trim();
      if(text)return {text,source:'Hugging Face'};
    }
  }catch(error){return {text:localContentPack(prompt,style),source:'Plantilla local',warning:error?.message||'El proveedor de texto no respondió.'};}
  return {text:localContentPack(prompt,style),source:'Plantilla local'};
}

async function aiCreation(files,params,callback){
  const prompt=String(params.prompt||'').trim();
  if(prompt.length<8)throw new Error('Describe tu idea con al menos ocho caracteres.');
  const pollinationsToken=String(params.polliToken||'').trim(),huggingfaceToken=String(params.hfToken||'').trim();
  let providersToTry=[];
  if(params.provider==='pollinations')providersToTry=['pollinations'];
  else if(params.provider==='huggingface')providersToTry=['huggingface'];
  else{if(pollinationsToken)providersToTry.push('pollinations');if(huggingfaceToken)providersToTry.push('huggingface');}
  if(!providersToTry.length)throw new Error('Conecta Pollinations desde el Laboratorio IA o introduce tu token personal de Hugging Face. Puedes elegir el motor automático para que Prisma seleccione el disponible.');
  const tokens={pollinations:pollinationsToken,huggingface:huggingfaceToken},errors=[];
  let generated=null,providerUsed='';
  for(let index=0;index<providersToTry.length;index++){
    const provider=providersToTry[index];
    if(provider==='pollinations'&&!pollinationsToken)continue;
    if(provider==='huggingface'&&!huggingfaceToken)continue;
    try{
      callback?.(.08+index*.06,provider==='pollinations'?'Conectando con Pollinations...':'Conectando con Hugging Face...');
      generated=await runStep('image-gen',[],{provider,model:provider==='pollinations'?'black-forest-labs/flux.1-schnell':'black-forest-labs/FLUX.1-schnell',prompt,style:params.style||'photo',ratio:params.ratio||'square',negativePrompt:params.negativePrompt||'',seed:params.seed||'',polliToken:pollinationsToken,hfToken:huggingfaceToken},callback,.12,.56,'Generando imagen');
      providerUsed=provider;break;
    }catch(error){errors.push((provider==='pollinations'?'Pollinations: ':'Hugging Face: ')+(error?.message||'error de generación'));if(params.provider!=='auto')throw error;}
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
  const content=await generateContentPack(providerUsed,tokens,prompt,params.style||'photo',callback);
  const contentBlob=new Blob([content.text],{type:'text/plain;charset=utf-8'});
  callback?.(1,'Imagen y contenido preparados.');
  return {
    artifacts:[
      {name:'Imagen lista para publicar',filename:finalImage.filename||'prisma-imagen-final.webp',blob:finalImage.blob,previewUrl:finalImage.previewUrl,type:finalImage.blob.type},
      {name:'Paquete de contenido',filename:'prisma-contenido-para-publicar.txt',blob:contentBlob,text:content.text,type:'text/plain'}
    ],
    summary:'Imagen generada con '+(providerUsed==='pollinations'?'Pollinations Connect':'Hugging Face')+'. Se preparó un paquete de título, descripción, hashtags y texto alternativo.'+(content.warning?' La copia se completó con una plantilla local porque el motor de texto no respondió.':'')+(errors.length?' Se cambió de proveedor después de un intento fallido.':''),
    steps:['Idea interpretada','Imagen generada',...editTasks.map(task=>task.label),'Contenido preparado'],
    warnings:[...errors,...(content.warning?[content.warning]:[])]
  };
}

export async function runWorkflow(id,files=[],params={},callback){
  callback?.(.02,'Preparando flujo inteligente...');
  if(id==='image-pipeline')return imagePipeline(files,params,callback);
  if(id==='document-pipeline')return documentPipeline(files,params,callback);
  if(id==='ai-creation')return aiCreation(files,params,callback);
  throw new Error('No reconocemos ese flujo de trabajo.');
}
