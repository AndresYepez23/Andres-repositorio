#!/usr/bin/env node
'use strict';
// Production UI smoke. No staging bridge, mocked response, credential, or engine bypass.
// Preparing/checking this file does not launch Chromium; running it does.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const usage='node '+path.basename(__filename)+' --base https://prismaspace.space --output /absolute/new-directory [--local-only] [--check-dependencies]\nQUEEN_TEST_TOOLING=/workspace/work/queen-tooling (or NODE_PATH) supplies Playwright; QUEEN_CHROMIUM optionally selects Chromium.\nQUEEN_TEST_PROXY_TLS_EXCEPTION=1 enables a reported context-only exception for the managed proxy.\nOne local JSON task, then one real PDF→Word UI task; at most 2 Queen inferences. No automatic retry. --local-only --check-dependencies uses no Queen.';
function failure(code){throw new Error(code);}
async function withDeadline(operation,timeout,code){
 let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),timeout);})]);}
 finally{clearTimeout(timer);}
}
function argumentsFor(argv){
 const options={localOnly:false};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--help'){console.log(usage);return null;}
  if(argv[i]==='--local-only')options.localOnly=true;
  else if(argv[i]==='--check-dependencies')options.checkDependencies=true;
  else if(['--base','--output'].includes(argv[i])&&argv[i+1])options[argv[i].slice(2)]=argv[++i];
  else failure('INVALID_ARGUMENT');
 }
 const value=options.base||process.env.QUEEN_TEST_BASE_URL;if(!value)failure('EXPLICIT_PRODUCTION_BASE_REQUIRED');
 let u;try{u=new URL(value);}catch{failure('INVALID_PRODUCTION_BASE');}
 if(u.protocol!=='https:'||!['prismaspace.space','prismaspace.pages.dev'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')failure('PRODUCTION_HOST_REQUIRED');
 options.base=u.origin;options.output=path.resolve(options.output||process.env.QUEEN_TEST_OUTPUT||path.join(__dirname,'prismaspace-ui-'+Date.now()));
 return options;
}
function loadPlaywright(){
 if(process.env.QUEEN_TEST_TOOLING)return require(path.join(path.resolve(process.env.QUEEN_TEST_TOOLING),'node_modules','playwright'));
 return require('playwright');
}
function pdfFixture(){
 // Ordinary uncompressed, selectable Helvetica text; no dependency or model needed.
 const texts=['FIRST PAGE MUST BE ABSENT','QUEEN SECOND PAGE 2026','THIRD PAGE MUST BE ABSENT'];
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<3;i++){
  const stream=`BT /F1 18 Tf 40 300 Td (${texts[i]}) Tj ET\n`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
 }
 let value='%PDF-1.4\n',offsets=[0];
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(value));value+=`${i+1} 0 obj\n${object}\nendobj\n`;});
 const start=Buffer.byteLength(value);value+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))value+=String(offset).padStart(10,'0')+' 00000 n \n';
 return Buffer.from(value+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
function zipEntry(bytes,wanted){
 if(bytes.length<22||bytes.length>50*1024*1024)failure('ARTIFACT_SIZE_INVALID');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))failure('INVALID_DOCX_ZIP');
 const count=bytes.readUInt16LE(end+10);let offset=bytes.readUInt32LE(end+16);if(count>256)failure('DOCX_ENTRY_BUDGET');
 for(let i=0;i<count;i++){
  if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)failure('INVALID_DOCX_DIRECTORY');
  const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),expanded=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
  if(offset+46+nameLength+extra+comment>bytes.length)failure('INVALID_DOCX_DIRECTORY');
  const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');offset+=46+nameLength+extra+comment;
  if(name!==wanted)continue;
  if(flags&1||expanded>16*1024*1024||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)failure('INVALID_DOCX_ENTRY');
  const begin=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(begin+compressed>bytes.length)failure('INVALID_DOCX_ENTRY');
  const packed=bytes.subarray(begin,begin+compressed);let value;
  if(method===0)value=packed;else if(method===8)value=zlib.inflateRawSync(packed,{maxOutputLength:16*1024*1024});else failure('DOCX_COMPRESSION_UNSUPPORTED');
  if(value.length!==expanded)failure('DOCX_ENTRY_LENGTH_MISMATCH');return value.toString('utf8');
 }
 failure('DOCX_DOCUMENT_MISSING');
}
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const label=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,90}$/.test(value)?value:null;
function errorEvidence(error,phase,step){
 const message=String(error?.message||'').slice(0,2000)
  .replace(/\x1b\[[0-9;]*m/g,'')
  .replace(/https?:\/\/[^\s<>"')]+/g,value=>{try{const u=new URL(value);return u.origin+u.pathname+(u.search?'?[redacted]':'');}catch{return '[redacted-url]';}})
  .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\b(api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*\S+/gi,'$1=[redacted]')
  .replace(/\b[a-f0-9]{64,}\b/gi,'[redacted-token]');
 return {name:label(error?.name)||'Error',message,phase,step};
}
function responseEvidence(data){
 const metrics=data?.metrics||{},diagnostics=data?.diagnostics||{};
 return {ok:data?.ok===true,source:label(data?.source),code:label(data?.code),
  metrics:Object.fromEntries(['inferences','inputTokens','outputTokens','durationMs','repairs','retrievals'].map(key=>[key,number(metrics[key])])),
  failureInferencesAttempted:number(diagnostics.inferencesAttempted),
  plan:data?.plan?{intent:label(data.plan.intent),steps:(Array.isArray(data.plan.steps)?data.plan.steps:[]).slice(0,12).map(step=>({id:label(step.id),tool:label(step.tool_id),pages:typeof step.params?.pages==='string'||typeof step.params?.pages==='number'?String(step.params.pages).slice(0,24):null,dependsOn:(step.dependsOn||[]).map(label),inputs:(step.inputs||[]).map(label)}))}:null};
}
function syntheticRequestEvidence(payload){
 const goal='Extrae la segunda página de este PDF y después convierte esa página a Word';
 const text=payload?.text===goal||payload?.text==='Formatea este JSON: {"controlLocal":true}'?payload.text:'[redacted-nonsynthetic-text]';
 const context=payload?.context||{},preferences=context.preferences||{};
 return {text,textLength:typeof payload?.text==='string'?payload.text.length:null,repair:payload?.repair===true,
  files:(Array.isArray(payload?.files)?payload.files:[]).slice(0,20).map(file=>({name:file.name==='queen-three-pages.pdf'?file.name:'[redacted]',type:file.type==='application/pdf'?file.type:'[redacted]',size:number(file.size)})),
  context:{previousGoal:context.previousGoal===''?'':'[redacted-or-absent]',previousTools:(Array.isArray(context.previousTools)?context.previousTools:[]).slice(0,8).map(label),procedureCount:Array.isArray(context.procedure)?context.procedure.length:null,
   preferences:{mode:['auto','manual'].includes(preferences.mode)?preferences.mode:null,provider:preferences.provider===''?'':label(preferences.provider),model:preferences.model===''?'':label(preferences.model)}},
  omittedUnknownFieldCount:Object.keys(payload||{}).filter(key=>!['text','files','context','repair'].includes(key)).length};
}
async function main(options){
 process.umask(0o077);if(fs.existsSync(options.output))failure('OUTPUT_ALREADY_EXISTS');fs.mkdirSync(options.output,{recursive:true,mode:0o700});
 const write=(name,value)=>fs.writeFileSync(path.join(options.output,name),value,{mode:0o600});
 const tlsException=process.env.QUEEN_TEST_PROXY_TLS_EXCEPTION==='1';
 const report={at:new Date().toISOString(),base:options.base,mode:'actual-production-ui',mockedResponses:0,stagingReroutes:0,maximumQueenInferences:2,localOnly:options.localOnly,tlsVerification:tlsException?'environment-proxy-context-exception':'browser-default',requests:[],blockedRequests:[],aggregateTelemetrySuppressed:0,pageErrorCount:0,cases:{},ok:false};
 let browser,context,page,phase='local',step='initialize',fatal=null,signalFatal;
 const fatalPromise=new Promise(resolve=>{signalFatal=resolve;}),fail=code=>{if(!fatal){fatal=code;signalFatal(code);}};
 const pending=new Set(),byRequest=new Map();
 const save=()=>write('results.json',JSON.stringify(report,null,2)+'\n');
 const wallTimer=setTimeout(()=>{
  report.ok=false;report.error='HARNESS_WALL_CLOCK_DEADLINE';report.errorDetails={name:'Error',message:report.error,phase,step};
  report.dispatchedQueenRequests=report.requests.length;report.confirmedQueenInferences=null;report.unresolvedDispatchedRequests=report.requests.filter(row=>!row.finished||row.transportFailed||row.responseReadFailed).length;
  report.forcedExitAt=new Date().toISOString();save();console.error('HARNESS_WALL_CLOCK_DEADLINE');process.exit(1);
 },300000);
 try{
  const {chromium}=loadPlaywright();browser=await chromium.launch({executablePath:process.env.QUEEN_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  context=await browser.newContext({acceptDownloads:true,locale:'es-ES',ignoreHTTPSErrors:tlsException,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  // Only abort unsafe/unbudgeted requests. Every allowed request uses its original
  // production URL/body; responses are never fulfilled, replaced, or fabricated.
  await context.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url()),method=request.method();
   if(!['GET','HEAD','OPTIONS'].includes(method)){
    // This optional aggregate counter writes the principal rate DB and cannot
    // affect a task. Suppress it without fabricating a response or failing UI.
    if(u.origin===options.base&&u.pathname==='/api/core/metrics'&&method==='POST'){report.aggregateTelemetrySuppressed++;save();return route.abort();}
    if(u.pathname==='/cdn-cgi/rum'&&(u.origin===options.base||u.hostname==='cloudflareinsights.com')){report.browserTelemetrySuppressed=(report.browserTelemetrySuppressed||0)+1;save();return route.abort();}
    if(u.origin===options.base&&u.pathname==='/api/core/plan'&&method==='POST'){
     let payload;try{payload=request.postDataJSON();}catch{fail('UNREADABLE_PLAN_REQUEST');return route.abort();}
     const prior=report.requests.at(-1);
     if(prior&&!prior.finished)await Promise.race([prior.done,new Promise(resolve=>setTimeout(resolve,5000))]);
     const permitted=phase==='neural'&&!fatal&&(report.requests.length===0||report.requests.length===1&&payload?.repair===true&&prior?.finished&&prior.source==='queen'&&prior.metrics?.inferences===1);
     if(!permitted){report.blockedRequests.push({kind:'queen-plan',reason:'BUDGET_OR_PHASE_GUARD'});fail('QUEEN_REQUEST_BLOCKED');save();return route.abort();}
     if(report.requests.length===0&&payload?.repair){fail('UNEXPECTED_INITIAL_REPAIR');return route.abort();}
     let finish;const record={kind:'queen-plan',path:'/api/core/plan',repair:payload?.repair===true,at:new Date().toISOString(),dispatched:true,finished:false,httpStatus:null,requestPayload:syntheticRequestEvidence(payload),requestBodySha256:crypto.createHash('sha256').update(request.postData()||'').digest('hex')};
     Object.defineProperties(record,{done:{value:new Promise(resolve=>{finish=resolve;})},finish:{value:finish}});
     report.requests.push(record);byRequest.set(request,record);save();return route.continue();
    }
    report.blockedRequests.push({kind:u.origin===options.base?'other-api-write':'foreign-write',path:/^\/(?:api|cdn-cgi)\/[a-z0-9/_-]{1,100}$/i.test(u.pathname)?u.pathname:'[redacted-path]',reason:'OUTSIDE_TWO_LOCAL_ENGINE_TASKS'});save();
    fail('UNEXPECTED_NETWORK_WRITE');return route.abort();
   }
   return route.continue();
  });
  page=await context.newPage();page.on('pageerror',()=>{report.pageErrorCount++;});
  page.on('response',response=>{
   const record=byRequest.get(response.request());if(!record)return;
   const job=(async()=>{
    record.httpStatus=response.status();record.responseHeadersAt=new Date().toISOString();save();
    try{
     const raw=await withDeadline(()=>response.text(),10000,'PLAN_RESPONSE_BODY_DEADLINE');if(Buffer.byteLength(raw)>1024*1024)failure('PLAN_RESPONSE_TOO_LARGE');
     const evidence=responseEvidence(JSON.parse(raw));Object.assign(record,evidence);
     if(record.httpStatus!==200||!record.ok||record.source!=='queen')fail('QUEEN_RESPONSE_FAILED');
     if(![1,2].includes(record.metrics.inferences)||record.repair&&record.metrics.inferences!==1)fail('INFERENCE_ACCOUNTING_UNKNOWN');
     if(record.plan?.intent!=='execute')fail('QUEEN_DID_NOT_RETURN_EXECUTION');
    }catch(error){record.responseReadFailed=true;record.responseError=errorEvidence(error,phase,step);fail('PLAN_RESPONSE_UNREADABLE');}
    finally{record.finished=true;record.finishedAt=new Date().toISOString();record.finish();save();}
   })();pending.add(job);job.finally(()=>pending.delete(job));
  });
  page.on('requestfailed',request=>{const record=byRequest.get(request);if(record){record.transportFailed=true;record.finish();fail('PLAN_OUTCOME_UNKNOWN');save();}});
  step='navigate';const navigation=await page.goto(options.base+'/',{waitUntil:'domcontentloaded',timeout:45000});
  if(!navigation?.ok()||new URL(page.url()).origin!==options.base)failure('PRODUCTION_NAVIGATION_FAILED');
  step='open-core';const core=page.locator('[data-view="core"]');if(await core.count())await core.first().click();
  await page.locator('#core-input').waitFor({state:'visible',timeout:30000});
  async function submit(text,timeout){
   report.activeSubmit={step,startedAt:new Date().toISOString(),deadlineAt:new Date(Date.now()+timeout).toISOString(),timeoutMs:timeout,status:'pending'};save();
   try{await withDeadline(async()=>{
    const before=await page.locator('#core-messages .core-message.assistant').count();
    await page.locator('#core-input').fill(text);await page.locator('#core-send').click();
    await Promise.race([page.waitForFunction(count=>document.querySelectorAll('#core-messages .core-message.assistant').length>count&&document.querySelector('#core-send')?.disabled===false,before,{timeout}),fatalPromise.then(code=>failure(code))]);
    if(pending.size)await Promise.allSettled([...pending]);if(fatal)failure(fatal);
   },timeout,'UI_TASK_DEADLINE');report.activeSubmit.status='completed';}
   catch(error){report.activeSubmit.status='failed';fail(label(error?.message)||'UI_TASK_FAILED');throw error;}
   finally{report.activeSubmit.finishedAt=new Date().toISOString();save();}
  }
  step='local-json';await submit('Formatea este JSON: {"controlLocal":true}',30000);
  const localTexts=await page.locator('#core-messages .core-result-card pre').allTextContents();
  const localText=localTexts.find(text=>{try{return JSON.stringify(JSON.parse(text))==='{"controlLocal":true}';}catch{return false;}});
  if(!localText||!localText.includes('\n')||report.requests.length)failure('LOCAL_JSON_BASELINE_FAILED');
  report.cases.localJson={ok:true,uiFlow:true,actualEngineOutput:true,formatted:true,dataUnchanged:true,queenRequests:0,realInference:false};save();
  if(!options.localOnly||options.checkDependencies){
   if(!options.localOnly){step='new-chat';await page.locator('#core-history-new:visible, #core-clear:visible').first().click();}
   const fixture=pdfFixture();write('input-three-pages.pdf',fixture);
   report.fixture={file:'input-three-pages.pdf',pages:3,bytes:fixture.length,sha256:crypto.createHash('sha256').update(fixture).digest('hex'),type:'digital-selectable-text'};
   // Detect inaccessible production engine dependencies before reserving any
   // inference. This imports libraries only; the conversion still runs via UI.
   step='pdf-dependencies';let dependencyTimer;
   try{await Promise.race([page.evaluate(async()=>{
    await Promise.all([import('https://esm.sh/pdf-lib@1.17.1'),import('https://esm.sh/docx@9.5.1'),import('https://esm.sh/jszip@3.10.1'),import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs')]);
    const worker=await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs');if(!worker.ok)throw Error('DEPENDENCY_HTTP_FAILURE');await worker.arrayBuffer();
   }),new Promise((_,reject)=>{dependencyTimer=setTimeout(()=>reject(Error('DEPENDENCY_TIMEOUT')),45000);})]);}
   catch(error){report.dependencyError=errorEvidence(error,phase,step);failure('PDF_DEPENDENCY_PREFLIGHT_FAILED');}finally{clearTimeout(dependencyTimer);}
   report.dependencyPreflight={ok:true,libraryImportsOnly:true,workerHttpAvailable:true,engineExecutionProven:false};save();
   if(!options.localOnly){
   step='attach-pdf';
   await page.locator('#core-file-input').setInputFiles({name:'queen-three-pages.pdf',mimeType:'application/pdf',buffer:fixture});
   await page.locator('#core-attachments').getByText('queen-three-pages.pdf',{exact:false}).waitFor({timeout:10000});
   phase='neural';step='pdf-word-submit';await submit('Extrae la segunda página de este PDF y después convierte esa página a Word',125000);phase='after';step='pdf-word-download';
   if(!report.requests.length||report.requests.some(row=>!row.finished||row.source!=='queen'))failure('NO_CONFIRMED_QUEEN_PLAN');
   const initial=report.requests[0].plan,extract=initial?.steps.find(step=>step.tool==='pdf-extract'),word=initial?.steps.find(step=>step.tool==='pdf-to-word');
   if(initial?.steps.length!==2||!extract||extract.pages!=='2'||!extract.inputs.includes('file:0')||!word||!word.dependsOn.includes(extract.id)||!word.inputs.includes('step:'+extract.id))failure('PDF_WORD_PLAN_SEMANTICS_FAILED');
   await withDeadline(async()=>{
   const rows=page.locator('#core-messages .core-result-download');let row=null;
   for(let i=0;i<await rows.count();i++)if(/\.docx$/i.test((await rows.nth(i).locator('span').first().innerText()).trim())){row=rows.nth(i);break;}
   if(!row)failure('DOCX_DOWNLOAD_NOT_PRESENT');
   const downloadPromise=page.waitForEvent('download',{timeout:15000});await row.getByRole('button',{name:'Descargar',exact:true}).click();const download=await downloadPromise;
   if(await download.failure())failure('DOCX_DOWNLOAD_FAILED');
   const artifactPath=path.join(options.output,'page-2.docx');await download.saveAs(artifactPath);fs.chmodSync(artifactPath,0o600);
   const bytes=fs.readFileSync(artifactPath),xml=zipEntry(bytes,'word/document.xml'),text=xml.replace(/<[^>]*>/g,'');
   const selected=text.includes('QUEEN SECOND PAGE 2026'),othersAbsent=!text.includes('FIRST PAGE')&&!text.includes('THIRD PAGE');
   report.cases.pdfWord={ok:selected&&othersAbsent,uiFlow:true,queenSourceConfirmed:true,realInference:true,engineExecution:'actual-browser-local-engines',artifact:{file:'page-2.docx',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},inspection:{wordDocumentXmlPresent:true,secondPageMarkerPresent:selected,firstAndThirdPageMarkersAbsent:othersAbsent},queenInferences:report.requests.reduce((sum,row)=>sum+row.metrics.inferences,0)};
   if(!report.cases.pdfWord.ok)failure('DOCX_CONTENT_MISMATCH');
   if(report.cases.pdfWord.queenInferences>2)failure('INFERENCE_BUDGET_EXCEEDED');
   },30000,'ARTIFACT_DOWNLOAD_DEADLINE');
   }
  }
  report.ok=true;
 }catch(error){report.error=label(error?.message)||'BROWSER_SMOKE_FAILED';report.errorDetails=errorEvidence(error,phase,step);save();}
 finally{
  phase='after';report.cleanupStartedAt=new Date().toISOString();save();
  if(page)try{await withDeadline(()=>page.screenshot({path:path.join(options.output,'browser.png'),fullPage:true,timeout:2500}),3000,'SCREENSHOT_DEADLINE');}catch{report.screenshotUnavailable=true;}
  if(context)try{await withDeadline(()=>context.close(),3000,'CONTEXT_CLOSE_DEADLINE');}catch{report.contextCloseIncomplete=true;}
  if(browser)try{await withDeadline(()=>browser.close(),3000,'BROWSER_CLOSE_DEADLINE');}catch{report.browserCloseIncomplete=true;}
  if(fatal){report.ok=false;report.error=fatal;}
  report.dispatchedQueenRequests=report.requests.length;
  report.confirmedQueenInferences=report.requests.every(row=>row.finished&&row.source==='queen'&&[1,2].includes(row.metrics?.inferences))?report.requests.reduce((sum,row)=>sum+row.metrics.inferences,0):null;
  report.unresolvedDispatchedRequests=report.requests.filter(row=>!row.finished||row.transportFailed||row.responseReadFailed).length;
  report.continuousPerformanceOrGeneralQualityProven=false;report.cleanupFinishedAt=new Date().toISOString();save();clearTimeout(wallTimer);
 }
 console.log(JSON.stringify({ok:report.ok,output:options.output,error:report.error||null,queenRequests:report.dispatchedQueenRequests,confirmedQueenInferences:report.confirmedQueenInferences}));
 if(!report.ok)process.exitCode=1;
}
if(require.main===module){try{const options=argumentsFor(process.argv.slice(2));if(options)main(options).then(()=>process.exit(process.exitCode||0)).catch(()=>{console.error('SMOKE_INITIALIZATION_FAILED');process.exit(1);});}catch(error){console.error(label(error?.message)||'SMOKE_ARGUMENT_ERROR');process.exitCode=1;}}
module.exports={argumentsFor,pdfFixture,zipEntry,responseEvidence,errorEvidence,withDeadline,syntheticRequestEvidence};
