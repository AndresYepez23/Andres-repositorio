// Executes a just-received real Queen PDF plan; never requests a new plan.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {chromium}=require('playwright'),run=promisify(execFile);
const [responseFile,inputFile,outputDirectory]=process.argv.slice(2);
if(!responseFile||!inputFile||!outputDirectory)throw Error('RESPONSE_INPUT_OUTPUT_REQUIRED');
const response=JSON.parse(fs.readFileSync(responseFile,'utf8')),neural=response.body;
if(!neural?.ok||neural.source!=='queen'||neural.realInference!==true||neural.metrics?.inferences!==1)throw Error('REAL_ACCEPTED_SINGLE_INFERENCE_REQUIRED');
const deadline=Date.parse(response.at)+120000;
if(!Number.isFinite(deadline)||deadline<=Date.now())throw Error('ORIGINAL_TASK_DEADLINE_EXPIRED');
const out=path.resolve(outputDirectory);fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(out+'/results.json'))throw Error('OUTPUT_ALREADY_EXISTS');
const input=fs.readFileSync(inputFile),cache=process.env.QUEEN_DEPENDENCY_CACHE||path.join(out,'cdn');
fs.mkdirSync(cache,{recursive:true});
const inputSha=crypto.createHash('sha256').update(input).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.QUEEN_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let timer;
 try{
  const context=await browser.newContext();let blockedApiRequests=0;
  await context.route('**/api/**',async route=>{blockedApiRequests++;await route.abort();});
  await context.route(/^https:\/\/(esm.sh|cdnjs.cloudflare.com|cdn.jsdelivr.net)\//,async route=>{
   try{
    const url=route.request().url(),key=crypto.createHash('sha256').update(url).digest('hex'),cached=path.join(cache,key);
    const body=fs.existsSync(cached)?fs.readFileSync(cached):(await run('curl',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-time','15',url],{encoding:'buffer',maxBuffer:40*1024*1024})).stdout;
    if(!fs.existsSync(cached))fs.writeFileSync(cached,body);
    await route.fulfill({status:200,contentType:/\.wasm(?:\?|$)/.test(url)?'application/wasm':/\.gz(?:\?|$)/.test(url)?'application/gzip':'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body});
   }catch{await route.abort();}
  });
  const page=await context.newPage();await page.goto('http://127.0.0.1:4175/src/registry.js',{waitUntil:'domcontentloaded'});
  const result=await Promise.race([page.evaluate(async({bytes,neural,deadline})=>{
   const {runTool}=await import('/src/engines.js'),{executeQueenDAG}=await import('/src/queen-execution.js'),{validateQueenPlan}=await import('/src/queen-plan.js');
   const file=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'queen-three-pages.pdf',{type:'application/pdf'});
   const plan=validateQueenPlan(neural.plan,{files:[file],taskId:neural.plan.taskId});
   if(JSON.stringify(plan.steps.map(s=>s.tool_id))!==JSON.stringify(['pdf-extract','pdf-to-word'])||plan.steps[0].params.pages!=='2'||JSON.stringify(plan.steps[1].inputs)!==JSON.stringify(['step:s1']))throw Error('REQUESTED_PLAN_CONTENT_MISMATCH');
   const e=await executeQueenDAG(plan,[file],{run:runTool,maxMs:deadline-Date.now(),cancel:()=>Date.now()>=deadline,initialInferences:1});
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;
   const docx=e.results.at(-1).result.blob,zip=await JSZip.loadAsync(await docx.arrayBuffer()),xml=await zip.file('word/document.xml').async('text');
   const matches=xml.includes('QUEEN SECOND PAGE 2026')&&!xml.includes('FIRST PAGE')&&!xml.includes('THIRD PAGE');
   if(!matches)throw Error('DOCX_CONTENT_MISMATCH');
   const artifacts=[];for(const r of e.results)if(r.result.blob)artifacts.push({name:r.result.filename,type:r.result.blob.type,base64:btoa(String.fromCharCode(...new Uint8Array(await r.result.blob.arrayBuffer())))});
   return {ok:true,realBrowserEngines:true,planSource:'just-received-real-queen-plan',newInferenceRequests:0,originalTaskId:plan.taskId,toolIds:e.results.map(r=>r.tool_id),executionStatus:e.status,genericExecutionVerified:e.verified,ledger:e.ledger,independentVerification:{requestedPageContent:true,otherPageContentAbsent:true},artifacts,completedAt:new Date().toISOString()};
  },{bytes:input.toString('base64'),neural,deadline}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ORIGINAL_TASK_DEADLINE_EXPIRED')),Math.max(1,deadline-Date.now()));})]);
  for(const a of result.artifacts){const b=Buffer.from(a.base64,'base64');const name=path.basename(a.name);fs.writeFileSync(path.join(out,name),b,{flag:'wx'});a.bytes=b.length;a.sha256=crypto.createHash('sha256').update(b).digest('hex');delete a.base64;}
  result.input={name:'queen-three-pages.pdf',bytes:input.length,sha256:inputSha,content:'Three real PDF pages with synthetic control text'};result.blockedApiRequests=blockedApiRequests;result.totalTaskDurationMs=Date.now()-Date.parse(response.at);
  fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:true,resultFile:out+'/results.json',taskDurationMs:result.totalTaskDurationMs,contentVerified:true,genericExecutionVerified:result.genericExecutionVerified}));
 }finally{clearTimeout(timer);await browser.close();}
})().catch(error=>{fs.writeFileSync(out+'/error.json',JSON.stringify({ok:false,code:error.message,at:new Date().toISOString(),newInferenceRequests:0},null,2)+'\n',{flag:'wx'});console.error(error.message);process.exitCode=1;});
