// Opt-in, sequential real Queen plans + existing browser executors. Never runs
// on a production host, invents a plan, calls a specialist or retries a request.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const base=process.env.QUEEN_COMPARISON_BASE||'';
if(!/^https:\/\/[a-f0-9]{8}\.prisma-queen-staging\.pages\.dev$/.test(base))throw Error('IMMUTABLE_ISOLATED_STAGING_REQUIRED');
const expectedCommit=process.env.QUEEN_EXPECTED_COMMIT;
if(!/^[a-f0-9]{40}$/.test(expectedCommit||''))throw Error('EXPECTED_COMMIT_REQUIRED');
const key=fs.readFileSync(process.env.QUEEN_STAGING_OPERATOR_KEY_FILE,'utf8').trim();
if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY');
const out=path.resolve(process.env.QUEEN_COMPARISON_OUTPUT||'work/queen-core-comparison');
if(fs.existsSync(out+'/results.json'))throw Error('REPORT_ALREADY_EXISTS');
fs.mkdirSync(out,{recursive:true});
const cache=path.resolve(process.env.QUEEN_CDN_CACHE||'work/queen-cdn-cache');fs.mkdirSync(cache,{recursive:true});
const selected=(process.env.QUEEN_COMPARISON_CASES||'').split(',').filter(Boolean);
const report={base,expectedCommit,selectedCases:selected,startedAt:new Date().toISOString(),realBrowser:true,realFileBytes:true,metadataOnlyToQueen:true,specialistInferences:0,requests:[],rows:[]};
const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');
async function operator(route,body){
 return new Promise(resolve=>{
  const args=['--silent','--show-error','--max-time','115','--config','-','--write-out','\n%{http_code}',base+route];
  if(body)args.push('--request','POST','--header','Origin: '+base,'--header','Content-Type: application/json','--data',JSON.stringify(body));
  const began=Date.now(),child=spawn('curl',args,{stdio:['pipe','pipe','pipe']});let raw='',bytes=0;
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024)child.kill();else raw+=b;});child.stderr.resume();
  child.stdin.end('header = "X-Queen-Staging-Key: '+key+'"\n');
  child.on('error',()=>resolve({httpStatus:0,body:{code:'REQUEST_FAILED'},durationMs:Date.now()-began}));
  child.on('close',code=>{const i=raw.lastIndexOf('\n');let data;try{data=JSON.parse(raw.slice(0,i));}catch{data={code:'NON_JSON_RESPONSE'};}
   resolve({httpStatus:code===0?Number(raw.slice(i+1)):0,body:data,durationMs:Date.now()-began});});
 });
}
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(filename!==root&&!filename.startsWith(root+'/'))return res.writeHead(403).end();
 const target=fs.existsSync(filename)&&fs.statSync(filename).isDirectory()?filename+'/index.html':filename;
 if(!fs.existsSync(target))return res.writeHead(404).end();
 res.setHeader('Content-Type',({'js':'text/javascript','mjs':'text/javascript','html':'text/html','json':'application/json','css':'text/css','svg':'image/svg+xml'})[target.split('.').pop()]||'application/octet-stream');fs.createReadStream(target).pipe(res);
});
(async()=>{
 const {stagingHealthReady}=await import('./isolation.mjs');
 const {inferenceEvidence,stopAfterFailure}=await import('./quality-evaluation.mjs');
 report.health=await operator('/__queen/health');
 if(!stagingHealthReady(report.health,{requireQueen:true,expectedCommit}))throw Error('ISOLATED_BUILD_NOT_READY');
 report.server=await operator('/__queen/server',{});
 if(report.server.body.observations?.slots?.slots?.some(s=>s.isProcessing))throw Error('SERVER_BUSY_NO_INFERENCE_SENT');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let recorded=null;
 const browser=await chromium.launch({executablePath:process.env.QUEEN_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({locale:'es-ES'});
  await context.route(/^https?:\/\//,async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    if(u.pathname==='/__comparison/queen'){
     if(report.requests.length>=6)return route.fulfill({status:429,contentType:'application/json',body:'{"ok":false,"code":"COMPARISON_REQUEST_BUDGET","comparisonStop":true}'});
     const payload=JSON.parse(route.request().postData());if(payload.maxInferences!==1)throw Error('ONE_INFERENCE_REQUIRED');
     const result=await operator('/__queen/plan',payload);
     report.requests.push({request:payload,...result,usage:inferenceEvidence(result.body)});save();
     return route.fulfill({status:result.httpStatus||502,contentType:'application/json',body:JSON.stringify({...result.body,comparisonStop:stopAfterFailure(result)})});
    }
    if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"available":false}'});
    return route.continue();
   }
   if(!['esm.sh','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(u.hostname))return route.abort();
   const file=cache+'/'+crypto.createHash('sha256').update(u.href).digest('hex');
   try{if(!fs.existsSync(file))fs.writeFileSync(file,execFileSync('curl',['--fail','--silent','--show-error','--location','--max-time','60',u.href],{maxBuffer:30*1024*1024}));
    return route.fulfill({status:200,contentType:u.pathname.endsWith('.wasm')?'application/wasm':'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(file)});
   }catch{return route.abort();}
  });
  const page=await context.newPage();
  await page.exposeFunction('comparisonCheckpoint',row=>{report.rows.push(row);save();});
  await page.exposeFunction('comparisonArtifact',artifact=>{
   const name=path.basename(artifact.filename),bytes=Buffer.from(artifact.bytes);fs.writeFileSync(out+'/'+name,bytes);
   return {filename:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const pdfPath=process.env.QUEEN_PDF_FIXTURE||'work/document-preflight/tres-paginas.pdf';
  const pdfBytes=fs.existsSync(pdfPath)?Array.from(fs.readFileSync(pdfPath)):null;
  recorded=process.env.QUEEN_RECORDED_PDF_RESPONSE?JSON.parse(fs.readFileSync(process.env.QUEEN_RECORDED_PDF_RESPONSE,'utf8')):null;
  if(recorded&&recorded.base!==base)throw Error('RECORDED_RESPONSE_DEPLOYMENT_MISMATCH');
  report.recordedPdfInference=recorded;save();
  await page.evaluate(async({pdfBytes,recorded,selected})=>{
   const {planWithPrismaCore}=await import('/src/developer-api.js');
   const {assessEvaluation}=await import('/neural-pilot/staging/quality-evaluation.mjs');
   const {runTool}=await import('/src/engines.js');
   const {executeQueenDAG}=await import('/src/queen-execution.js');
   const {runToolBatch,resultFiles,OBSERVERS}=await import('/src/core-execution.js');
   const {queenTaskContext}=await import('/src/queen-client.js');
   const {tools}=await import('/src/registry.js');
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;
   let fixtureBytes=pdfBytes;
   if(!fixtureBytes){const {PDFDocument,StandardFonts}=await import('https://esm.sh/pdf-lib@1.17.1');const d=await PDFDocument.create(),font=await d.embedFont(StandardFonts.Helvetica);for(const text of ['FIRST PAGE OMIT','SECOND PAGE KEEP 123','THIRD PAGE OMIT'])d.addPage([600,400]).drawText(text,{x:40,y:300,font,size:18});fixtureBytes=Array.from(await d.save());}
   const pdf=new File([new Uint8Array(fixtureBytes)],'tres-paginas.pdf',{type:'application/pdf'});
   const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#a638d1';ctx.fillRect(0,0,96,64);ctx.clearRect(0,0,15,15);
   const image=new File([await new Promise(r=>canvas.toBlob(r,'image/png'))],'foto-prueba.png',{type:'image/png'});
   await window.comparisonArtifact({filename:pdf.name,bytes:Array.from(new Uint8Array(await pdf.arrayBuffer()))});
   await window.comparisonArtifact({filename:image.name,bytes:Array.from(new Uint8Array(await image.arrayBuffer()))});
   const metadata=f=>({name:f.name,type:f.type,size:f.size});
   const ids=steps=>steps.map(s=>s.tool_id);
   const tests=[
    {id:'semantic-middle-page-word',text:'De este PDF de tres páginas, toma únicamente la hoja intermedia y entrégala en un Word editable.',files:[pdf],expect:['pdf-extract','pdf-to-word'],kind:'pdf',recorded},
    {id:'split-and-original-word',text:'Extrae la segunda página del PDF y después convierte todo el PDF original a Word.',files:[pdf],expect:['pdf-extract','pdf-to-word'],kind:'original-pdf'},
    {id:'ambiguous-image-size',text:'Cambia el tamaño de esta imagen.',files:[image],expect:[],kind:'clarify'},
    {id:'json-format-then-minify',text:'Primero formatea este JSON: {"nota":"solo datos","valores":[7,12]}. Después minifica ese resultado sin cambiar los datos.',files:[],expect:['json-format','json-minify'],kind:'json'},
    {id:'image-metadata-then-webp',text:'Quita los metadatos de esta foto y después conviértela a WebP sin recortarla.',files:[image],expect:['image-strip-metadata','image-convert'],kind:'image'},
    {id:'reference-to-generated-word',text:'Convierte ese resultado a TXT.',files:[],expect:['text-file-convert'],kind:'followup'}
   ];
   let producedWord=null,previousPlan=null,producedWhole=false,stop=false;
   async function inspect(test,steps,result,files){
    if(JSON.stringify(ids(steps))!==JSON.stringify(test.expect))throw Error('REQUESTED_OPERATIONS_MISMATCH');
    if(test.kind==='pdf'||test.kind==='original-pdf'){
     if(steps[0].params.pages!=='2'||steps[1].inputs&&!steps[1].inputs.includes(test.kind==='original-pdf'?'file:0':'step:'+steps[0].id))throw Error('PAGE_OR_HANDOFF_MISMATCH');
     const zip=await JSZip.loadAsync(await result.blob.arrayBuffer()),xml=await zip.file('word/document.xml').async('text');
     if(!xml.includes('SECOND PAGE KEEP 123')||(test.kind==='original-pdf'?(!xml.includes('FIRST PAGE OMIT')||!xml.includes('THIRD PAGE OMIT')):(xml.includes('FIRST PAGE')||xml.includes('THIRD PAGE'))))throw Error('WORD_CONTENT_MISMATCH');
     return {selectedPageOnly:test.kind==='pdf',allOriginalPages:test.kind==='original-pdf',orderedTextVerified:true};
    }
    if(test.kind==='json'){
     const value=JSON.parse(result.text);if(value.nota!=='solo datos'||JSON.stringify(value.valores)!=='[7,12]'||Object.keys(value).length!==2||JSON.stringify(value)!==result.text)throw Error('JSON_NOT_MINIFIED_OR_CHANGED');return {minifiedJsonAndDataPreserved:true};
    }
    if(test.kind==='image'){
     const decoded=await createImageBitmap(result.blob),e={mime:result.blob.type,width:decoded.width,height:decoded.height};decoded.close();
     if(e.mime!=='image/webp'||e.width!==96||e.height!==64)throw Error('WEBP_CONTENT_MISMATCH');return e;
    }
    if(test.kind==='followup'){
     const text=await result.blob.text();if(!text.includes('SECOND PAGE KEEP 123')||(producedWhole?(!text.includes('FIRST PAGE OMIT')||!text.includes('THIRD PAGE OMIT')):(text.includes('FIRST PAGE')||text.includes('THIRD PAGE'))))throw Error('FOLLOWUP_CONTENT_MISMATCH');return {previousResultTextPreserved:true};
    }
   }
   const active=selected.length?tests.filter(t=>selected.includes(t.id)):tests;
   if(selected.some(id=>!tests.some(t=>t.id===id)))throw Error('UNKNOWN_COMPARISON_CASE');
   for(const test of active){
    const row={id:test.id,request:test.text,local:null,queen:null};
    if(stop){row.skipped='STOP_AFTER_UNKNOWN_OUTCOME';await window.comparisonCheckpoint(row);continue;}
    if(test.kind==='followup'){
     if(!producedWord){row.skipped='NO_PREVIOUS_WORD_RESULT';await window.comparisonCheckpoint(row);continue;}test.files=[producedWord];
    }
    const local=planWithPrismaCore({text:test.text,files:test.files}).planner;
    row.local={type:local.type,source:local.source,tools:ids(local.steps),executed:false,goalMet:false};
    if(test.kind==='clarify')row.local.goalMet=local.type==='needs-input'&&local.steps.length===0;
    else if(local.type==='ready'){
     let current=test.files,last=null,lastText='';
     try{
      for(const step of local.steps){const tool=tools.find(t=>t.id===step.tool_id);if(!['local','browser'].includes(tool.mode))throw Error('NO_SPECIALIST_EXECUTION');
       const params={...step.params};if(!tool.file&&!params.text&&lastText)params.text=lastText;
       last=await runToolBatch(tool,current,params,runTool);lastText=last.text||'';
       if(!OBSERVERS.has(tool.id)&&resultFiles(last).length)current=resultFiles(last);
      }
      row.local.executed=true;
      if(last?.blob)row.local.artifact=await window.comparisonArtifact({filename:'local-'+test.id+'-'+last.filename,bytes:Array.from(new Uint8Array(await last.blob.arrayBuffer()))});
      row.local.evidence=await inspect(test,local.steps,last,current);row.local.goalMet=true;
     }catch(error){row.local.error=error.message;}
    }
    const began=Date.now();let body;
    try{
     const payload={text:test.text,files:test.files.map(metadata),maxInferences:1,capturePartialOutput:true,...(test.kind==='followup'?{context:queenTaskContext({task:{steps:previousPlan.steps}})}:{})};
     body=test.recorded?.body||(await (await fetch('/__comparison/queen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).json());
     if(body.comparisonStop)stop=true;
     row.queen={source:body.source||null,intent:body.plan?.intent||null,tools:ids(body.plan?.steps||[]),metrics:body.metrics||null,diagnostics:body.diagnostics||null,realInference:(body.realInference===true&&body.source==='queen'&&body.metrics?.inferences>0)||body.diagnostics?.trace?.length>0||Number.isFinite(body.diagnostics?.observedOutputTokens),executed:false,goalMet:false};
     if(!body.ok||!row.queen.realInference)throw Error(body.code||'REAL_QUEEN_INFERENCE_NOT_PROVEN');
     row.queen.planAssessment=assessEvaluation({expect:{intents:[test.kind==='clarify'?'clarify':'execute'],tools:test.expect,sequentialInputs:['json','image'].includes(test.kind)}},body);
     if(!row.queen.planAssessment.automatedPassed)throw Error('PLAN_QUALITY_OR_DEPENDENCY_FAILED');
     if(test.kind==='clarify'){
      if(body.plan.intent!=='clarify'||body.plan.steps.length||!/(?:dimensiones|tamaño|ancho|alto|medidas)/i.test(body.plan.message))throw Error('AMBIGUITY_NOT_RESOLVED_SAFELY');
      row.queen.message=body.plan.message;row.queen.goalMet=true;
     }else{
      if(body.plan.intent!=='execute')throw Error('NO_EXECUTABLE_NEURAL_PLAN');
      if(body.plan.steps.some(s=>!['local','browser'].includes(tools.find(t=>t.id===s.tool_id)?.mode)))throw Error('NO_SPECIALIST_EXECUTION');
      const execution=await executeQueenDAG(body.plan,test.files,{run:runTool,initialInferences:body.metrics.inferences,maxMs:Math.max(1000,120000-(Date.now()-began))});
      row.queen.executed=execution.executed;row.queen.verified=execution.verified;row.queen.verifications=execution.results.map(r=>({tool:r.tool_id,...r.verification}));
      const last=execution.results.at(-1).result;
      row.queen.artifacts=[];
      for(const entry of execution.results){if(entry.result.blob)row.queen.artifacts.push({...await window.comparisonArtifact({filename:test.id+'-'+entry.id+'-'+entry.result.filename,bytes:Array.from(new Uint8Array(await entry.result.blob.arrayBuffer()))}),verification:entry.verification.status});}
      row.queen.evidence=await inspect(test,body.plan.steps,last,execution.results.at(-1).files);row.queen.goalMet=true;
      if(test.kind==='json')row.queen.artifacts.push({...await window.comparisonArtifact({filename:test.id+'.json',bytes:Array.from(new TextEncoder().encode(last.text))}),verification:execution.results.at(-1).verification.status});
      if(test.kind==='pdf'||test.kind==='original-pdf'){producedWhole=test.kind==='original-pdf';producedWord=new File([last.blob],last.filename,{type:last.blob.type});previousPlan=body.plan;}
     }
    }catch(error){row.error=error.message;}
    row.improvesOnLocal=row.queen?.goalMet===true&&row.local.goalMet===false;
    await window.comparisonCheckpoint(row);
   }
  },{pdfBytes,recorded,selected});
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 const liveBodies=report.requests.map(r=>r.body),all=[...(recorded?[recorded.body]:[]),...liveBodies];
 report.summary={cases:report.rows.length,queenCompletions:all.reduce((n,b)=>n+inferenceEvidence(b).completionsObserved,0),goalMet:report.rows.filter(r=>r.queen?.goalMet).length,generatedArtifacts:report.rows.flatMap(r=>r.queen?.artifacts||[]).length,fullyVerifiedArtifacts:report.rows.flatMap(r=>r.queen?.artifacts||[]).filter(a=>a.verification==='verified').length,improvements:report.rows.filter(r=>r.improvesOnLocal).map(r=>r.id),skipped:report.rows.filter(r=>r.skipped).length};
 report.finishedAt=new Date().toISOString();save();
 if(report.rows.some(r=>r.error||r.skipped)||!report.summary.improvements.length)process.exitCode=1;
 fs.writeSync(1,JSON.stringify(report.summary)+'\n');
})().catch(error=>{report.error=error.message;save();server.close();console.error(error);process.exitCode=1;});
