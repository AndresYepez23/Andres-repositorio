const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const reportDir=path.resolve(process.env.QUEEN_TEST_OUTPUT||'work/queen-browser');
fs.mkdirSync(reportDir,{recursive:true});
const base=process.env.QUEEN_TEST_BASE_URL||'http://127.0.0.1:4173';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.QUEEN_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  const payload=url.endsWith('/providers/status')?{ok:true,providers:{},features:{},modelCatalog:{},usage:{}}:url.endsWith('/auth/config')?{enabled:false}:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 // Fetch official dependency sources through the environment's trusted HTTPS proxy.
 if(process.env.QUEEN_TEST_PROXY_FETCH==='1')await page.route('https://esm.sh/**',async route=>{
  const r=await run('curl',['--fail','--silent','--show-error','--location','--max-time','45',route.request().url()],{maxBuffer:8*1024*1024});
  await route.fulfill({status:200,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:r.stdout});
 });
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const {executeQueenDAG}=await import('/src/queen-execution.js');
  const {validateQueenPlan}=await import('/src/queen-plan.js');
  const {runTool}=await import('/src/engines.js');
  const {verifyQueenResult}=await import('/src/queen-verifier.js');
  const plan=validateQueenPlan({intent:'execute',message:'Prueba local',steps:[{id:'s1',tool_id:'json-format',params:{text:'{"a":1}'},dependsOn:[],inputs:[]},{id:'s2',tool_id:'json-minify',params:{},dependsOn:['s1'],inputs:['step:s1']}]});
  const text=await executeQueenDAG(plan,[],{run:runTool});
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;canvas.getContext('2d').fillRect(0,0,320,200);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  const image=new File([blob],'original.png',{type:'image/png'});
  const imagePlan=validateQueenPlan({intent:'execute',message:'Resize real',steps:[{id:'s1',tool_id:'image-resize',params:{width:160,height:100,keep:true},dependsOn:[],inputs:['file:0']}]},{files:[image]});
  const resized=await executeQueenDAG(imagePlan,[image],{run:runTool});
  const {PDFDocument}=await import('https://esm.sh/pdf-lib@1.17.1');
  const pdf=await PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage();
  const file=new File([await pdf.save()],'three.pdf',{type:'application/pdf'});
  const pdfPlan=validateQueenPlan({intent:'execute',message:'Extraer página 2',steps:[{id:'s1',tool_id:'pdf-extract',params:{pages:'2'},dependsOn:[],inputs:['file:0']}]},{files:[file]});
  const extracted=await executeQueenDAG(pdfPlan,[file],{run:runTool});
  const wrong=await PDFDocument.create();wrong.addPage();wrong.addPage();let rejected=false;
  try{await verifyQueenResult({tool_id:'pdf-extract',params:{pages:'2'}},{blob:new Blob([await wrong.save()],{type:'application/pdf'}),filename:'wrong.pdf'},[file]);}catch(e){rejected=e.message==='PDF_PAGE_COUNT_MISMATCH';}
  const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;const fake=new JSZip();fake.file('unrelated.txt','wrong');let officeRejected=false;
  try{await verifyQueenResult({tool_id:'pdf-to-word',params:{}},{filename:'fake.docx',blob:await fake.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})},[]);}catch(e){officeRejected=e.message==='INVALID_OFFICE_STRUCTURE';}
  return {json:{status:text.status,result:text.results[1].result.text},image:{status:resized.status,evidence:resized.results[0].verification.evidence},pdf:{status:extracted.status,pages:extracted.results[0].verification.evidence[0].pages,wrongPageCountRejected:rejected},office:{fakeDocxRejected:officeRejected}};
 });
 if(result.json.status!=='verified'||result.image.status!=='verified'||result.pdf.status!=='verified'||!result.pdf.wrongPageCountRejected||!result.office.fakeDocxRejected)throw Error(JSON.stringify(result));
 const queenPlan={taskId:'browser-queen-fixture',objective:'Prueba del flujo del chat',intent:'execute',message:'Plan sintético de prueba',status:'validated',steps:[{id:'s1',tool_id:'json-format',params:{text:'{"browser":true}'},dependsOn:[],inputs:[],status:'planned'}]};
 await page.route('**/api/core/plan',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,source:'queen',plan:queenPlan,metrics:{inferences:1}})}));
 await page.locator('#core-input').fill('Necesito un procesamiento semántico de ejemplo');
 await page.locator('#core-send').click();
 await page.locator('#core-messages').getByText('Los resultados pasaron las comprobaciones independientes.',{exact:false}).waitFor({timeout:15000});
 await page.route('**/api/core/plan',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,source:'queen',plan:{...queenPlan,intent:'question',message:'Respuesta factual de la prueba de Queen.',steps:[]},metrics:{inferences:1}})}));
 await page.locator('#core-input').fill('¿Qué explica la formación de una supernova?');
 await page.locator('#core-send').click();
 await page.locator('#core-messages').getByText('Respuesta factual de la prueba de Queen.',{exact:false}).waitFor({timeout:15000});
 result.ui={queenPlanToRealLocalExecution:true,queenQuestionWithoutExternalProvider:true,pageErrors:errors};
 await page.screenshot({path:path.join(reportDir,'browser.png'),fullPage:true});
 fs.writeFileSync(path.join(reportDir,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
