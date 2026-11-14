// Exact reader used in this workspace; adjust local paths after cloning. No model or engine calls.
// Read actual saved artifacts with the current coordinator verifier.
// No inference, engine execution, task resumption, or task deadline reset.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {chromium}=require('playwright'),run=promisify(execFile);
const root='/workspace/work/PRISMA-queen-422/prisma/docs/queen-422-2026-11-14';
const cache='/workspace/work/queen-live/browser-composition-control/cdn';
const files={selected:root+'/real-pdf-word/queen-three-pages-paginas-seleccionadas.pdf',word:root+'/real-pdf-word/queen-three-pages-paginas-seleccionadas.docx',original:path.resolve(root,'../queen-handoff-2026-11-13/1a7c97c-staging-input-three-pages.pdf')};
const data=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p).toString('base64')]));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let timer;
 try{
  const context=await browser.newContext();
  await context.route('**/api/**',route=>route.abort());
  await context.route(/^https:\/\/(esm.sh|cdnjs.cloudflare.com|cdn.jsdelivr.net)\//,async route=>{
   try{const url=route.request().url(),cached=path.join(cache,crypto.createHash('sha256').update(url).digest('hex'));
    const body=fs.existsSync(cached)?fs.readFileSync(cached):(await run('curl',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-time','15',url],{encoding:'buffer',maxBuffer:40*1024*1024})).stdout;
    await route.fulfill({status:200,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body});
   }catch{await route.abort();}
  });
  const page=await context.newPage();await page.goto('http://127.0.0.1:4175/src/registry.js');
  const result=await Promise.race([page.evaluate(async data=>{
   const {verifyQueenResult}=await import('/src/queen-verifier.js');
   const file=(key,name,type)=>new File([Uint8Array.from(atob(data[key]),c=>c.charCodeAt(0))],name,{type});
   const result={blob:file('word','selected.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),filename:'selected.docx'};
   const step={id:'s2',tool_id:'pdf-to-word',params:{}};
   const positive=(await verifyQueenResult(step,result,[file('selected','selected.pdf','application/pdf')])).verification;
   let wrongSource;try{const value=await verifyQueenResult(step,result,[file('original','original-three-pages.pdf','application/pdf')]);wrongSource={rejected:false,status:value.verification.status};}catch(e){wrongSource={rejected:true,code:e.verificationCode||e.message};}
   return {positive,wrongSource,newInferenceRequests:0,toolExecutions:0,verificationOfSavedBytes:true,originalExecutionLedgerUnmodified:true};
  },data),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('VERIFICATION_READ_TIMEOUT')),45000);})]);
  fs.writeFileSync('/workspace/work/queen-422-build/saved-artifact-reverification.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));
 }finally{clearTimeout(timer);await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
