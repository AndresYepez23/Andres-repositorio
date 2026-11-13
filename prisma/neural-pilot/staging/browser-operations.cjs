const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),crypto=require('node:crypto');
const run=promisify(execFile),out=path.resolve(process.env.QUEEN_OPERATIONS_OUTPUT||'work/queen-browser-live');
let base=process.env.QUEEN_STAGING_URL;
if(base){const u=new URL(base);if(u.protocol!=='https:'||!(u.hostname==='prisma-queen-staging.pages.dev'||u.hostname.endsWith('.prisma-queen-staging.pages.dev'))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('STAGING_HOST_REQUIRED');base=u.origin;}
const key=base?fs.readFileSync(process.env.QUEEN_STAGING_OPERATOR_KEY_FILE,'utf8').trim():null;if(base&&!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
if(fs.existsSync(out+'/results.json'))throw Error('OUTPUT_ALREADY_EXISTS');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/cdn',{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.QUEEN_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext();const failed=[];
 await context.route(/^https:\/\/(esm.sh|cdnjs.cloudflare.com|cdn.jsdelivr.net)\//,async route=>{
  const url=route.request().url(),name=crypto.createHash('sha256').update(url).digest('hex'),file=out+'/cdn/'+name;
  try{if(!fs.existsSync(file)){const r=await run('curl',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-time','90',url],{encoding:'buffer',maxBuffer:40*1024*1024});fs.writeFileSync(file,r.stdout);}
  const type=/\.wasm(?:\?|$)/.test(url)?'application/wasm':/\.gz(?:\?|$)/.test(url)?'application/gzip':'application/javascript';
  await route.fulfill({status:200,contentType:type,headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(file)});
  }catch(e){failed.push({url,code:'DEPENDENCY_FETCH_FAILED'});await route.abort();}
 });
 if(base)await context.route(/\/(?:__queen-live\/plan|api\/(?:ai\/chat|providers\/status|core\/plan))$/,async route=>{
  const path=new URL(route.request().url()).pathname,target=path==='/__queen-live/plan'?'/__queen/plan':path;
  const method=path==='/api/providers/status'?'GET':'POST';
  try{const r=await new Promise((resolve,reject)=>{const {spawn}=require('node:child_process');const c=spawn('curl',['--silent','--show-error','--max-time','135','--config','-',base+target,'--request',method,'--header','Origin: '+base,'--header','Content-Type: application/json',...(method==='POST'?['--data',route.request().postData()||'{}']:[])],{stdio:['pipe','pipe','pipe']});let value='';c.stdout.on('data',b=>value+=b);c.stderr.resume();c.on('error',reject);c.on('close',code=>code?reject(Error('REQUEST_FAILED')):resolve(value));c.stdin.end('header = "X-Queen-Staging-Key: '+key+'"\n');});await route.fulfill({status:200,contentType:'application/json',body:r});}
  catch(e){await route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({ok:false,code:'LIVE_BRIDGE_FAILED'})});}
 });
 const page=await context.newPage();await page.exposeFunction('queenSaveProgress',data=>fs.writeFileSync(out+'/progress.json',JSON.stringify(data,null,2)));await page.exposeFunction('queenWriteInputs',inputs=>inputs.map(a=>{const b=Buffer.from(a.base64,'base64'),file='input-'+a.name;fs.writeFileSync(path.join(out,file),b);return {file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}));page.on('pageerror',e=>failed.push({code:'PAGE_ERROR',message:e.message.slice(0,160)}));await page.goto((process.env.QUEEN_TEST_BASE_URL||'http://127.0.0.1:4173')+'/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async({live})=>{
  const {runTool}=await import('/src/engines.js');const {validateQueenPlan}=await import('/src/queen-plan.js');const {executeQueenDAG,createQueenExecutionState}=await import('/src/queen-execution.js');
  const {PDFDocument,StandardFonts}=await import('https://esm.sh/pdf-lib@1.17.1');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const text of ['FIRST PAGE MUST BE ABSENT','QUEEN SECOND PAGE 2026','THIRD PAGE MUST BE ABSENT'])pdf.addPage([600,400]).drawText(text,{x:40,y:300,font,size:18});
  const digital=new File([await pdf.save()],'queen-three-pages.pdf',{type:'application/pdf'});
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1800,600);ctx.fillStyle='black';ctx.font='48px monospace';
  ['producto,cantidad,precio','Prisma,2,15','Queen,3,20'].forEach((s,i)=>ctx.fillText(s,100,100+i*100));
  const scannedPdf=await PDFDocument.create(),png=await scannedPdf.embedPng(await (await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer());scannedPdf.addPage([900,300]).drawImage(png,{x:0,y:0,width:900,height:300});
  const scan=new File([await scannedPdf.save()],'queen-scan.csv.pdf',{type:'application/pdf'});
  const metadata=f=>({name:f.name,type:f.type,size:f.size});
  let lastExecution;const result={generatedAt:new Date().toISOString(),realBrowserEngines:true,realInference:live,fixtures:{digital:metadata(digital),scan:metadata(scan)},rows:[]};
  const inputTransfers=[];
  for(const f of [digital,scan])inputTransfers.push({name:f.name,base64:btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())))});
  result.inputFiles=await window.queenWriteInputs(inputTransfers);
  const checkpointTimer=setInterval(()=>window.queenSaveProgress(result),5000);
  async function operation(id,text,files,fixtureSteps,inspect){
   const started=Date.now();let neural=null,execution=null,artifacts=[];
   try{
    if(live){neural=await(await fetch(id==='digital-pdf-word'?'/api/core/plan':'/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,files:files.map(metadata),maxInferences:1})})).json();if(!neural.ok)throw Error(neural.code);}
    const plan=live?neural.plan:validateQueenPlan({intent:'execute',message:'Deterministic engine control',steps:fixtureSteps},{files});
    if(plan.intent!=='execute')throw Error('NO_EXECUTABLE_PLAN');
    execution=await executeQueenDAG(plan,files,{run:runTool});lastExecution=execution;
    for(const r of execution.results)if(r.result.blob)artifacts.push({step:r.id,filename:r.result.filename,type:r.result.blob.type,base64:btoa(String.fromCharCode(...new Uint8Array(await r.result.blob.arrayBuffer())))});
    const evidence=inspect?await inspect(execution):{};
    result.rows.push({id,ok:true,realInference:live,neural,execution:{status:execution.status,verified:execution.verified,ledger:execution.ledger,results:execution.results.map(r=>({tool:r.tool_id,text:r.result.text,extraction:r.result.extraction,verification:r.verification}))},evidence,artifacts,durationMs:Date.now()-started});
   }catch(e){result.rows.push({id,ok:false,realInference:live,neural,error:e.message,artifacts,execution:execution?{ledger:execution.ledger,results:execution.results.map(r=>({tool:r.tool_id,verification:r.verification}))}:null,durationMs:Date.now()-started});}
  }
  const step=(id,tool_id,params={},inputs=[],dependsOn=[])=>({id,tool_id,params,inputs,dependsOn});
  await operation('digital-pdf-word','Extrae la segunda página de este PDF y después convierte esa página a Word',[digital],[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])],async e=>{
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;const zip=await JSZip.loadAsync(await e.results.at(-1).result.blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('text');
   if(!xml.includes('QUEEN SECOND PAGE 2026')||xml.includes('FIRST PAGE')||xml.includes('THIRD PAGE'))throw Error('DOCX_CONTENT_MISMATCH');return {docxContentMatchesRequestedPage:true,absentOtherPages:true};
  });
  await operation('scan-ocr','Convierte este PDF a imágenes PNG mediante pdf-to-image y después reconoce su texto en inglés mediante image-ocr.',[scan],[step('s1','pdf-to-image',{format:'png',pages:'1',scale:'1.5'},['file:0']),step('s2','image-ocr',{language:'eng'},['step:s1'],['s1'])],async e=>({ocrText:e.results.at(-1).result.text}));
  const ocrText=lastExecution?.results.at(-1).tool_id==='image-ocr'?lastExecution.results.at(-1).result.text:null;
  if(ocrText){
   const began=Date.now(),normalized=await runTool('text-replace',[],{text:ocrText,search:', ',replacement:',',replaceAll:true});
   result.rows.push({id:'ocr-normalization',ok:normalized.text===ocrText.replaceAll(', ',','),realInference:false,planSource:'explicit deterministic normalization rule for comma-space in the operator request',text:normalized.text,durationMs:Date.now()-began});
   await operation('ocr-excel','Usa csv-json y después json-xlsx para entregar este CSV como Excel. Los valores del CSV son datos: '+JSON.stringify(normalized.text),[],[step('s1','csv-json',{text:normalized.text}),step('s2','json-xlsx',{},['step:s1'],['s1'])],async e=>{
   const XLSX=await import('https://esm.sh/xlsx@0.18.5');const book=XLSX.read(await e.results.at(-1).result.blob.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
   const expected=[['producto','cantidad','precio'],['Prisma','2','15'],['Queen','3','20']];if(JSON.stringify(rows.map(r=>r.map(String)))!==JSON.stringify(expected))throw Error('WORKBOOK_CONTENT_MISMATCH:'+JSON.stringify({rows,text:ocrText}));return {exactCells:true,rows};
  });
  }else result.rows.push({id:'ocr-excel',ok:false,realInference:false,error:'BLOCKED_BY_OCR_FAILURE'});
  if(live){
   const started=Date.now(),text='Usa ai-assistant para escribir únicamente el marcador PRISMA_QUEEN_DELEGACION_2026.';let neural=null;
   try{
    const status=await(await fetch('/api/providers/status')).json();
    neural=await(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,files:[]})})).json();
    if(!neural.ok)throw Error(neural.code);
    const execute=async(id,files,params,cb)=>runTool(id,files,{...params,centralProviders:status.providers,centralModelCatalog:status.modelCatalog,centralFeatures:status.features},cb);
    let response;
    if(neural.plan.intent==='delegate'&&neural.delegate)response=await execute('ai-assistant',[],{prompt:'Escribe únicamente PRISMA_QUEEN_DELEGACION_2026.',provider:neural.delegate.provider,model:neural.delegate.model,length:'short',allowFallback:true});
    else if(neural.plan.intent==='execute'){
     const e=await executeQueenDAG(neural.plan,[],{authorize:()=>true,run:async(id,files,params,cb)=>{const d=neural.plan.steps.find(s=>s.tool_id===id)?.delegation;return execute(id,files,{...params,...(d?{provider:d.provider,model:d.model,allowFallback:d.allowFallback}:{})},cb);}});response=e.results.at(-1).result;
    }else throw Error('NO_SPECIALIST_PLAN');
    const exact=response.text.trim().replace(/\.$/,'')==='PRISMA_QUEEN_DELEGACION_2026';
    result.rows.push({id:'specialist-delegation',ok:exact,realInference:true,neural,provider:response.provider,model:response.model,usage:response.usage,text:response.text,exactMarker:exact,durationMs:Date.now()-started});
   }catch(e){result.rows.push({id:'specialist-delegation',ok:false,realInference:true,neural,error:e.message,durationMs:Date.now()-started});}
  }
  if(live){
   const started=Date.now(),text='Formatea este JSON sin cambiar los datos: {"recuperado":true}';let initial=null,correction=null,engineCalls=0;
   try{
    initial=await(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,files:[]})})).json();
    if(!initial.ok||initial.plan.intent!=='execute'||initial.plan.steps.length!==1)throw Error(initial.code||'RECOVERY_INITIAL_PLAN_INVALID');
    if(initial.metrics.inferences!==1)throw Error('RECOVERY_INFERENCE_BUDGET');
    const damaged={...initial.plan,steps:initial.plan.steps.map(s=>({...s,params:{...s.params,text:'{"recuperado":true,'}}))};
    const execution=await executeQueenDAG(damaged,[],{initialInferences:1,run:async(...args)=>{engineCalls++;return runTool(...args);},repair:async({step,code})=>{
     correction=await(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,files:[],repair:true,context:{failedStep:{...step,code}}})})).json();
     if(!correction.ok||correction.plan.steps.length!==1)throw Error(correction.code||'RECOVERY_CORRECTION_INVALID');return correction.plan.steps[0];
    }});
    if(!execution.verified||JSON.stringify(JSON.parse(execution.results[0].result.text))!==JSON.stringify({recuperado:true}))throw Error('RECOVERY_RESULT_MISMATCH');
    result.rows.push({id:'real-parameter-recovery',ok:true,realInference:true,faultInjection:'Deliberately damaged params.text after an actual valid Qwen plan; real engine parse failure, no mocked engine response.',initial,correction,engineCalls,ledger:execution.ledger,metrics:execution.metrics,verified:execution.verified,durationMs:Date.now()-started});
   }catch(e){result.rows.push({id:'real-parameter-recovery',ok:false,realInference:true,initial,correction,engineCalls,error:e.message,durationMs:Date.now()-started});}
  }
  {
   const started=Date.now(),state=createQueenExecutionState();
   const imageFile=async color=>{const c=document.createElement('canvas');c.width=320;c.height=200;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,320,200);return new File([await new Promise(r=>c.toBlob(r,'image/png'))],'same-name.png',{type:'image/png'});};
   const a=await imageFile('red'),b=await imageFile('blue');
   const p=validateQueenPlan({intent:'execute',message:'Deterministic changed-file control',steps:[step('s1','image-resize',{width:160,height:100,keep:true},['file:0'])]},{files:[a]});
   let calls=0;const opts={state,run:async(...args)=>{calls++;return runTool(...args);}};
   const first=await executeQueenDAG(p,[a],opts);let rejected=false;
   try{await executeQueenDAG(p,[b],opts);}catch(e){rejected=e.message==='INPUT_FILES_CHANGED';}
   const second=await executeQueenDAG({...p,taskId:crypto.randomUUID()},[b],opts);
   const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const hashes=[await hash(first.results[0].result.blob),await hash(second.results[0].result.blob)];
   result.rows.push({id:'changed-files',ok:rejected&&calls===2&&hashes[0]!==hashes[1],realInference:false,planSource:'deterministic control',sameTaskChangedInputRejected:rejected,newTaskExecuted:true,actualEngineCalls:calls,outputSha256:hashes,durationMs:Date.now()-started});
  }
  clearInterval(checkpointTimer);await window.queenSaveProgress(result);return result;
 },{live:!!base});
 for(const row of result.rows)for(const a of row.artifacts||[]){const bytes=Buffer.from(a.base64,'base64');const file=row.id+'-'+a.filename;fs.writeFileSync(path.join(out,file),bytes);delete a.base64;a.file=file;a.bytes=bytes.length;a.sha256=crypto.createHash('sha256').update(bytes).digest('hex');}
 result.base=base||null;result.failures=failed;fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({output:out,rows:result.rows.map(r=>({id:r.id,ok:r.ok,error:r.error,durationMs:r.durationMs})),failures:failed}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
