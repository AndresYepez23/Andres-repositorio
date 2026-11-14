const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),crypto=require('node:crypto');
const run=promisify(execFile),out=path.resolve(process.env.QUEEN_OPERATIONS_OUTPUT||'work/queen-browser-live');
const publicMode=!!process.env.QUEEN_PUBLIC_STAGING_URL;
if(publicMode&&process.env.QUEEN_STAGING_URL)throw Error('STAGING_MODES_ARE_EXCLUSIVE');
let base=process.env.QUEEN_STAGING_URL||process.env.QUEEN_PUBLIC_STAGING_URL;
if(base){const u=new URL(base);if(u.protocol!=='https:'||!(u.hostname==='prisma-queen-staging.pages.dev'||u.hostname.endsWith('.prisma-queen-staging.pages.dev'))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('STAGING_HOST_REQUIRED');base=u.origin;}
const key=base&&!publicMode?fs.readFileSync(process.env.QUEEN_STAGING_OPERATOR_KEY_FILE,'utf8').trim():null;
if(base&&!publicMode&&!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
if(fs.existsSync(out+'/results.json'))throw Error('OUTPUT_ALREADY_EXISTS');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/cdn',{recursive:true});
const selected=(process.env.QUEEN_OPERATIONS_CASES||'').split(',').map(s=>s.trim()).filter(Boolean);
const allowedCases=['digital-pdf-word','scan-ocr','ocr-excel','scan-excel-full-objective','specialist-delegation','real-parameter-recovery','changed-files'];
if(selected.some(id=>!allowedCases.includes(id)))throw Error('UNKNOWN_OPERATION_CASE');
const transportCalls=[],taskBudgets=new Map();let activeBudgetId=null;
(async()=>{
 const {dispatchOperationRequest,operationUsageEvidence}=await import('./operation-budget.mjs');
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
  const path=new URL(route.request().url()).pathname,target=path==='/__queen-live/plan'?(publicMode?'/api/core/plan':'/__queen/plan'):path;
  const method=path==='/api/providers/status'?'GET':'POST';
  const call={kind:path==='/api/ai/chat'?'specialist':path==='/api/providers/status'?'provider-metadata':'queen',path:target,task:route.request().headers()['x-queen-task-id']||activeBudgetId,dispatched:false,at:new Date().toISOString(),status:'pending',httpStatus:null,inputTokens:null,outputTokens:null};transportCalls.push(call);const started=Date.now();
  try{const declared=Number(route.request().headers()['x-queen-task-remaining-ms']);const r=await dispatchOperationRequest({taskId:call.task,budget:taskBudgets.get(call.task),remainingMs:declared},({timeoutSeconds})=>new Promise((resolve,reject)=>{const {spawn}=require('node:child_process');call.dispatched=true;const c=spawn('curl',['--silent','--show-error','--max-time',String(timeoutSeconds),'--config','-','--write-out','\n%{http_code}',base+target,'--request',method,'--header','Origin: '+base,'--header','Content-Type: application/json',...(method==='POST'?['--data',route.request().postData()||'{}']:[])],{stdio:['pipe','pipe','pipe']});let value='',bytes=0;c.stdout.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024)c.kill();else value+=b;});c.stderr.resume();c.on('error',reject);c.on('close',code=>{if(code)return reject(Error('REQUEST_FAILED'));const i=value.lastIndexOf('\n');resolve({body:value.slice(0,i),status:Number(value.slice(i+1))});});c.stdin.end(key?'header = "X-Queen-Staging-Key: '+key+'"\n':'');}));
   call.httpStatus=r.status;call.status='responded';let data;try{data=JSON.parse(r.body);}catch{}
   const usage=data?.metrics||data?.diagnostics||data?.usage||{};Object.assign(call,operationUsageEvidence(data));call.inferences=usage.inferencesAttempted??usage.inferences??null;call.code=data?.code||null;if(call.kind==='specialist'){call.provider=data?.provider||null;call.model=data?.model||null;}
   await route.fulfill({status:r.status,contentType:'application/json',body:r.body});
  }catch(e){call.status=call.dispatched?'outcome-unknown':'not-dispatched';call.code=call.dispatched?'LIVE_BRIDGE_FAILED':e.message;try{await route.fulfill({status:call.dispatched?502:408,contentType:'application/json',body:JSON.stringify({ok:false,code:call.code,...(!call.dispatched?{diagnostics:{inferencesAttempted:0,completedInferences:0}}:{})})});}catch{/* The browser may already have aborted this owned request. */}}
  finally{call.durationMs=Date.now()-started;fs.writeFileSync(out+'/requests.json',JSON.stringify(transportCalls,null,2));}
 });
 const page=await context.newPage();await page.exposeFunction('queenSetBudget',data=>{const deadline=Date.now()+data.remainingMs,prior=taskBudgets.get(data.id);taskBudgets.set(data.id,{id:data.id,deadline:prior?Math.min(prior.deadline,deadline):deadline});activeBudgetId=data.id;});await page.exposeFunction('queenSaveProgress',data=>fs.writeFileSync(out+'/progress.json',JSON.stringify(data,null,2)));await page.exposeFunction('queenWriteInputs',inputs=>inputs.map(a=>{const b=Buffer.from(a.base64,'base64'),file='input-'+a.name;fs.writeFileSync(path.join(out,file),b);return {file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}));page.on('pageerror',e=>failed.push({code:'PAGE_ERROR',message:e.message.slice(0,160)}));await page.goto((process.env.QUEEN_TEST_BASE_URL||'http://127.0.0.1:4173')+'/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async({live,selected})=>{
  const {runTool}=await import('/src/engines.js');const {validateQueenPlan}=await import('/src/queen-plan.js');const {executeQueenDAG,createQueenExecutionState}=await import('/src/queen-execution.js');
  const {createOperationBudget,specialistProofParameters}=await import('/neural-pilot/staging/operation-budget.mjs');
  const enabled=id=>!selected.length?id!=='scan-excel-full-objective':selected.includes(id);
  const {PDFDocument,StandardFonts}=await import('https://esm.sh/pdf-lib@1.17.1');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const text of ['FIRST PAGE MUST BE ABSENT','QUEEN SECOND PAGE 2026','THIRD PAGE MUST BE ABSENT'])pdf.addPage([600,400]).drawText(text,{x:40,y:300,font,size:18});
  const digital=new File([await pdf.save()],'queen-three-pages.pdf',{type:'application/pdf'});
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1800,600);ctx.fillStyle='black';ctx.font='48px monospace';
  ['producto,cantidad,precio','Prisma,2,15','Queen,3,20'].forEach((s,i)=>ctx.fillText(s,100,100+i*100));
  const scannedPdf=await PDFDocument.create(),png=await scannedPdf.embedPng(await (await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer());scannedPdf.addPage([900,300]).drawImage(png,{x:0,y:0,width:900,height:300});
  const scan=new File([await scannedPdf.save()],'queen-scan.csv.pdf',{type:'application/pdf'});
  const metadata=f=>({name:f.name,type:f.type,size:f.size});
  const observedInference=value=>(value?.metrics?.inferences??value?.diagnostics?.inferences??value?.diagnostics?.completedInferences??0)>0;
  let lastExecution;const result={generatedAt:new Date().toISOString(),realBrowserEngines:true,realInference:live,selectedCases:selected,fixtures:{digital:metadata(digital),scan:metadata(scan)},rows:[]};
  const inputTransfers=[];
  for(const f of [digital,scan])inputTransfers.push({name:f.name,base64:btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer())))});
  result.inputFiles=await window.queenWriteInputs(inputTransfers);
  const checkpointTimer=setInterval(()=>window.queenSaveProgress(result),5000);
  const artifactsFrom=async execution=>{const artifacts=[];for(const r of execution?.results||[])if(r.result.blob)artifacts.push({step:r.id,filename:r.result.filename,type:r.result.blob.type,base64:btoa(String.fromCharCode(...new Uint8Array(await r.result.blob.arrayBuffer())))});return artifacts;};
  async function operation(id,text,files,fixtureSteps,inspect,{task=createOperationBudget({id,objective:text}),maxAttempts=1,coordinationSource=live?'neural-plan':'deterministic-control'}={}){
   const started=Date.now();let neural=null,execution=null,artifacts=[];
   try{
    await window.queenSetBudget({id:task.id,remainingMs:task.remainingMs()});
    if(live){neural=await task.queen(id,async signal=>(await fetch(id==='digital-pdf-word'?'/api/core/plan':'/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json','X-Queen-Task-ID':task.id,'X-Queen-Task-Remaining-Ms':String(task.remainingMs())},signal,body:JSON.stringify({text,files:files.map(metadata),maxInferences:maxAttempts})})).json(),{maxAttempts:id==='digital-pdf-word'?2:maxAttempts});if(!neural.ok)throw Error(neural.code);}
    const plan=live?neural.plan:validateQueenPlan({intent:'execute',message:'Deterministic engine control',steps:fixtureSteps},{files});
    if(plan.intent!=='execute')throw Error('NO_EXECUTABLE_PLAN');
    task.reserveSteps(plan.steps.length);execution=await executeQueenDAG(plan,files,{run:runTool,maxMs:task.remainingMs(),cancel:()=>!task.remainingMs(),initialInferences:task.snapshot().inferencesReservedOrObserved});lastExecution=execution;
    artifacts=await artifactsFrom(execution);
    const evidence=inspect?await task.bounded(()=>inspect(execution)):{};
    result.rows.push({id,ok:true,realInferenceRequested:live,realInference:observedInference(neural),coordinationSource,neural,execution:{status:execution.status,verified:execution.verified,ledger:execution.ledger,results:execution.results.map(r=>({tool:r.tool_id,text:r.result.text,extraction:r.result.extraction,verification:r.verification}))},evidence,artifacts,taskBudget:task.snapshot(),durationMs:Date.now()-started});
   }catch(e){if(e.partialResults){execution={results:e.partialResults,ledger:e.ledger,status:'partial',verified:false};lastExecution=execution;}artifacts=await artifactsFrom(execution);result.rows.push({id,ok:false,realInferenceRequested:live,realInference:observedInference(neural),coordinationSource,neural,error:e.message,artifacts,execution:execution?{status:execution.status,ledger:execution.ledger,results:execution.results.map(r=>({tool:r.tool_id,text:r.result.text,verification:r.verification}))}:null,taskBudget:task.snapshot(),durationMs:Date.now()-started});}
   return result.rows.at(-1);
  }
  const step=(id,tool_id,params={},inputs=[],dependsOn=[])=>({id,tool_id,params,inputs,dependsOn});
  if(enabled('digital-pdf-word'))await operation('digital-pdf-word','Extrae la segunda página de este PDF y después convierte esa página a Word',[digital],[step('s1','pdf-extract',{pages:'2'},['file:0']),step('s2','pdf-to-word',{},['step:s1'],['s1'])],async e=>{
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;const zip=await JSZip.loadAsync(await e.results.at(-1).result.blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('text');
   if(!xml.includes('QUEEN SECOND PAGE 2026')||xml.includes('FIRST PAGE')||xml.includes('THIRD PAGE'))throw Error('DOCX_CONTENT_MISMATCH');return {docxContentMatchesRequestedPage:true,absentOtherPages:true};
  });
  const inspectWorkbook=async e=>{
   const XLSX=await import('https://esm.sh/xlsx@0.18.5');const book=XLSX.read(await e.results.at(-1).result.blob.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
   const expected=[['producto','cantidad','precio'],['Prisma','2','15'],['Queen','3','20']];if(JSON.stringify(rows.map(r=>r.map(String)))!==JSON.stringify(expected))throw Error('WORKBOOK_CONTENT_MISMATCH:'+JSON.stringify({rows}));return {exactCells:true,rows};
  };
  if(enabled('scan-excel-full-objective'))await operation('scan-excel-full-objective','Convierte el PDF escaneado adjunto en un Excel. El escaneo contiene texto CSV con encabezados. Reconoce el texto en inglés; elimina únicamente los espacios que aparezcan justo después de las comas antes de estructurar las filas. No inventes celdas ni contenido.',[scan],[step('s1','pdf-to-image',{format:'png',pages:'1',scale:'1.5'},['file:0']),step('s2','image-ocr',{language:'eng'},['step:s1'],['s1']),step('s3','text-replace',{search:', ',replacement:',',replaceAll:true},['step:s2'],['s2']),step('s4','csv-json',{},['step:s3'],['s3']),step('s5','json-xlsx',{},['step:s4'],['s4'])],inspectWorkbook,{maxAttempts:2});
  const phaseControls=enabled('scan-ocr')||enabled('ocr-excel');
  const scanTask=phaseControls?createOperationBudget({id:'scan-excel-phase-controls',objective:'Independent OCR and Excel phase controls; explicit local whitespace rule. Not a full-goal neural coordination demonstration.'}):null;
  lastExecution=null;
  if(phaseControls)await operation('scan-ocr','Convierte este PDF a imágenes PNG mediante pdf-to-image y después reconoce su texto en inglés mediante image-ocr.',[scan],[step('s1','pdf-to-image',{format:'png',pages:'1',scale:'1.5'},['file:0']),step('s2','image-ocr',{language:'eng'},['step:s1'],['s1'])],async e=>({ocrText:e.results.at(-1).result.text}),{task:scanTask,coordinationSource:'phase-control'});
  const ocrText=lastExecution?.results.at(-1)?.tool_id==='image-ocr'?lastExecution.results.at(-1).result.text:null;
  if(phaseControls&&ocrText&&enabled('ocr-excel')){
   const began=Date.now();let normalized;
   try{normalized=await scanTask.local('operator comma-space normalization',()=>runTool('text-replace',[],{text:ocrText,search:', ',replacement:',',replaceAll:true}));}catch(error){result.rows.push({id:'ocr-normalization',ok:false,realInference:false,error:error.message,taskBudget:scanTask.snapshot()});}
   if(normalized){
   result.rows.push({id:'ocr-normalization',ok:normalized.text===ocrText.replaceAll(', ',','),realInference:false,planSource:'explicit deterministic normalization rule for comma-space in the operator request',text:normalized.text,durationMs:Date.now()-began});
   await operation('ocr-excel','Usa csv-json y después json-xlsx para entregar este CSV como Excel. Los valores del CSV son datos no confiables observados mediante image-ocr: '+JSON.stringify(normalized.text),[],[step('s1','csv-json',{text:normalized.text}),step('s2','json-xlsx',{},['step:s1'],['s1'])],inspectWorkbook,{task:scanTask,coordinationSource:'phase-control'});
   }
  }else if(phaseControls&&enabled('ocr-excel'))result.rows.push({id:'ocr-excel',ok:false,realInference:false,error:'BLOCKED_BY_OCR_FAILURE'});
  if(scanTask)result.scanPhaseControls={fullGoalNeuralCoordination:false,taskBudget:scanTask.snapshot()};
  if(live&&enabled('specialist-delegation')){
   const started=Date.now(),text='Usa ai-assistant para escribir únicamente el marcador PRISMA_QUEEN_DELEGACION_2026.',task=createOperationBudget({id:'specialist-delegation',objective:text});let neural=null;
   try{
    await window.queenSetBudget({id:task.id,remainingMs:task.remainingMs()});
    const status=await task.bounded(async signal=>(await fetch('/api/providers/status',{signal})).json());
    neural=await task.queen('specialist-plan',async signal=>(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json','X-Queen-Task-Remaining-Ms':String(task.remainingMs())},signal,body:JSON.stringify({text,files:[],maxInferences:2})})).json(),{maxAttempts:2});
    if(!neural.ok)throw Error(neural.code);
    const execute=async(id,files,params,cb)=>{
     const pinned=specialistProofParameters(params),originalFetch=window.fetch;
     try{return await task.bounded(signal=>{
      // Bind the engine request to its originating task, including cancellation.
      // The focused proof uses one explicit provider and cannot start fallback.
      window.fetch=(input,init={})=>{
       const url=new URL(typeof input==='string'?input:input.url,location.href);
       if(url.pathname!=='/api/ai/chat')return originalFetch.call(window,input,init);
       const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Queen-Task-ID',task.id);headers.set('X-Queen-Task-Remaining-Ms',String(task.remainingMs()));
       return originalFetch.call(window,input,{...init,headers,signal:init.signal?AbortSignal.any([signal,init.signal]):signal});
      };
      return runTool(id,files,{...pinned,centralProviders:status.providers,centralModelCatalog:status.modelCatalog,centralFeatures:status.features},cb);
     });}finally{window.fetch=originalFetch;}
    };
    let response;
    if(neural.plan.intent==='delegate'&&neural.delegate){task.reserveSteps(1);response=await execute('ai-assistant',[],{prompt:'Escribe únicamente PRISMA_QUEEN_DELEGACION_2026.',provider:neural.delegate.provider,model:neural.delegate.model,length:'short',allowFallback:false});}
    else if(neural.plan.intent==='execute'){
     task.reserveSteps(neural.plan.steps.length);const e=await executeQueenDAG(neural.plan,[],{maxMs:task.remainingMs(),initialInferences:task.snapshot().inferencesReservedOrObserved,cancel:()=>!task.remainingMs(),authorize:()=>true,run:async(id,files,params,cb)=>{const d=neural.plan.steps.find(s=>s.tool_id===id)?.delegation;return execute(id,files,{...params,...(d?{provider:d.provider,model:d.model,allowFallback:false}:{})},cb);}});response=e.results.at(-1).result;
    }else throw Error('NO_SPECIALIST_PLAN');
    const exact=response.text.trim().replace(/\.$/,'')==='PRISMA_QUEEN_DELEGACION_2026';
    result.rows.push({id:'specialist-delegation',ok:exact,realInferenceRequested:true,realInference:observedInference(neural),specialistResponseReceived:true,neural,provider:response.provider,model:response.model,usage:response.usage,text:response.text,exactMarker:exact,taskBudget:task.snapshot(),durationMs:Date.now()-started});
   }catch(e){result.rows.push({id:'specialist-delegation',ok:false,realInferenceRequested:true,realInference:observedInference(neural),neural,error:e.message,taskBudget:task.snapshot(),durationMs:Date.now()-started});}
  }
  if(live&&enabled('real-parameter-recovery')){
   const started=Date.now(),text='Formatea este JSON: {"recuperado":true}. Después conserva el resultado sin cambiar los datos.',task=createOperationBudget({id:'real-parameter-recovery',objective:text});let initial=null,correction=null,engineCalls=0;
   try{
    await window.queenSetBudget({id:task.id,remainingMs:task.remainingMs()});
    initial=await task.queen('initial',async signal=>(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json','X-Queen-Task-Remaining-Ms':String(task.remainingMs())},signal,body:JSON.stringify({text,files:[],maxInferences:1})})).json());
    if(!initial.ok||initial.plan.intent!=='execute'||initial.plan.steps.length!==1)throw Error(initial.code||'RECOVERY_INITIAL_PLAN_INVALID');
    if(initial.metrics.inferences!==1)throw Error('RECOVERY_INFERENCE_BUDGET');
    const damaged={...initial.plan,steps:initial.plan.steps.map(s=>({...s,params:{...s.params,text:'{"recuperado":true,'}}))};
    task.reserveSteps(damaged.steps.length);const execution=await executeQueenDAG(damaged,[],{maxMs:task.remainingMs(),cancel:()=>!task.remainingMs(),initialInferences:1,run:async(...args)=>{engineCalls++;return runTool(...args);},repair:async({step,code})=>{
     correction=await task.queen('parameter-correction',async signal=>(await fetch('/__queen-live/plan',{method:'POST',headers:{'content-type':'application/json','X-Queen-Task-Remaining-Ms':String(task.remainingMs())},signal,body:JSON.stringify({text,files:[],repair:true,maxInferences:1,context:{failedStep:{...step,code}}})})).json());
     if(!correction.ok||correction.plan.steps.length!==1)throw Error(correction.code||'RECOVERY_CORRECTION_INVALID');return correction.plan.steps[0];
    }});
    if(!execution.verified||JSON.stringify(JSON.parse(execution.results[0].result.text))!==JSON.stringify({recuperado:true}))throw Error('RECOVERY_RESULT_MISMATCH');
    result.rows.push({id:'real-parameter-recovery',ok:true,realInferenceRequested:true,realInference:observedInference(initial)||observedInference(correction),faultInjection:'Deliberately damaged params.text after an actual valid Qwen plan; real engine parse failure, no mocked engine response.',initial,correction,engineCalls,ledger:execution.ledger,metrics:execution.metrics,verified:execution.verified,taskBudget:task.snapshot(),durationMs:Date.now()-started});
   }catch(e){result.rows.push({id:'real-parameter-recovery',ok:false,realInferenceRequested:true,realInference:observedInference(initial)||observedInference(correction),initial,correction,engineCalls,error:e.message,taskBudget:task.snapshot(),durationMs:Date.now()-started});}
  }
  if(enabled('changed-files')){
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
  result.realInferenceRequested=live;result.realInference=result.rows.some(r=>r.realInference);clearInterval(checkpointTimer);await window.queenSaveProgress(result);return result;
 },{live:!!base,selected});
 for(const row of result.rows)for(const a of row.artifacts||[]){const bytes=Buffer.from(a.base64,'base64');const file=row.id+'-'+a.filename;fs.writeFileSync(path.join(out,file),bytes);delete a.base64;a.file=file;a.bytes=bytes.length;a.sha256=crypto.createHash('sha256').update(bytes).digest('hex');}
 result.base=base||null;result.failures=failed;result.transportCalls=transportCalls;fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({output:out,rows:result.rows.map(r=>({id:r.id,ok:r.ok,error:r.error,durationMs:r.durationMs})),failures:failed}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
