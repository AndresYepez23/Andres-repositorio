// Actual browser, real file bytes and production engines. No model inference.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=process.env.PRISMA_FUNCTIONAL_ROOT?path.resolve(process.env.PRISMA_FUNCTIONAL_ROOT):path.resolve(__dirname,'../..');
const out=path.resolve(process.env.PRISMA_FUNCTIONAL_OUTPUT||'/tmp/prisma-document-conversion');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/cdn',{recursive:true});
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!filename.startsWith(root+'/')&&filename!==root){res.writeHead(403).end();return;}
 const target=fs.existsSync(filename)&&fs.statSync(filename).isDirectory()?filename+'/index.html':filename;
 if(!fs.existsSync(target)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'js':'text/javascript','html':'text/html','css':'text/css','json':'application/json','svg':'image/svg+xml'})[target.split('.').pop()]||'application/octet-stream');
 fs.createReadStream(target).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PRISMA_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const report={realBrowser:true,realFileBytes:true,queenInference:false,otherProviderInference:false,apiAttempts:[],cases:[]};
 try{
  const context=await browser.newContext({locale:'es-ES'});
  await context.route(/^https?:\/\//,async route=>{
   const url=route.request().url(),u=new URL(url);
   if(u.origin===origin){
    if(!u.pathname.startsWith('/api/'))return route.continue();
    report.apiAttempts.push({path:u.pathname,method:route.request().method()});
    return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"available":false}'});
   }
   if(!['esm.sh','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(u.hostname))return route.abort();
   const cache=out+'/cdn/'+require('node:crypto').createHash('sha256').update(url).digest('hex');
   try{
    if(!fs.existsSync(cache))fs.writeFileSync(cache,execFileSync('curl',['--fail','--silent','--show-error','--location','--max-time','60',url],{maxBuffer:25*1024*1024}));
    return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:u.pathname.endsWith('.wasm')?'application/wasm':'text/javascript',body:fs.readFileSync(cache)});
   }catch(error){return route.abort();}
  });
  const page=await context.newPage();
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#core-input');
  await page.evaluate(()=>{window.testReplies=[];document.addEventListener('prisma:core-message',event=>{if(event.detail.role==='assistant')window.testReplies.push(event.detail.content);});});
  const fixture=await page.evaluate(async()=>{
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;
   const zip=new JSZip();
   zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
   zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
   zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Informe PRISMA</w:t></w:r></w:p><w:p><w:r><w:t>Café, contenido verificable 2026 &amp; total 123.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Producto</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>');
   return {name:'informe.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:Array.from(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}))};
  });
  const buffer=Buffer.from(fixture.bytes);fs.writeFileSync(out+'/'+fixture.name,buffer);
  const prompt='Quiero transformar este archivo a otro formato, pero antes identifica su tipo, determina qué conversiones son compatibles y explícame cuál conserva mejor su contenido';
  await page.locator('#core-file-input').setInputFiles({name:fixture.name,mimeType:fixture.mimeType,buffer});
  await page.locator('#core-input').fill(prompt);await page.locator('#core-send').click();
  await page.waitForFunction(()=>window.testReplies.length>0);
  const reply=await page.evaluate(()=>window.testReplies.at(-1));
  report.cases.push({name:'docx-preflight-chat',reply});
  assert.match(reply,/DOCX/);assert.match(reply,/HTML/);assert.match(reply,/TXT/);assert.match(reply,/PDF/);
  assert.match(reply,/conserv|estructura|formato/);assert.doesNotMatch(reply,/^¿A qué formato quieres/);
  await page.waitForFunction(()=>!document.querySelector('#core-send').disabled);
  await page.locator('#core-input').fill('A HTML');await page.locator('#core-send').click();
  await page.waitForSelector('.core-result-download button');
  const downloadEvent=page.waitForEvent('download');
  await page.locator('.core-result-download button').filter({hasText:/^Descargar$/}).last().click();
  const download=await downloadEvent;await download.saveAs(out+'/informe.html');
  const html=fs.readFileSync(out+'/informe.html','utf8');
  assert.match(html,/Café, contenido verificable 2026 &amp; total 123\./);
  assert.match(html,/<table>/);assert.match(html,/>Producto</);assert.match(html,/>42</);
  report.cases.push({name:'docx-to-html-followup-download',filename:download.suggestedFilename(),textPreserved:true,tablePreserved:true});
  const controls=await page.evaluate(async()=>{
   const {runTool}=await import('/src/engines.js');
   const {assessFileConversions,planFileConversion}=await import('/src/file-conversions.js');
   const {planWithPrismaCore}=await import('/src/developer-api.js');
   const {resultFiles,runToolBatch}=await import('/src/core-execution.js');
   const {tools}=await import('/src/registry.js');
   const {PDFDocument,StandardFonts}=await import('https://esm.sh/pdf-lib@1.17.1');
   const JSZip=(await import('https://esm.sh/jszip@3.10.1')).default;
   const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
   for(const text of ['FIRST PAGE OMIT','SECOND PAGE KEEP 123','THIRD PAGE OMIT'])pdf.addPage([600,400]).drawText(text,{x:40,y:300,font,size:18});
   const input=new File([await pdf.save()],'tres-paginas.pdf',{type:'application/pdf'}),artifacts=[];
   const archive=async(file,name=file.name)=>artifacts.push({name,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});
   await archive(input);
   const pdfReport=await assessFileConversions([input],{run:runTool});
   if(!pdfReport.includes('DOCX, PNG, JPG, TXT')||!pdfReport.includes('no conserva imágenes'))throw Error('PDF_ASSESSMENT_INACCURATE');
   const multi=planWithPrismaCore({text:'Extrae la segunda página del PDF y conviértela a Word',files:[input]}).planner;
   if(JSON.stringify(multi.steps.map(s=>s.tool_id))!==JSON.stringify(['pdf-extract','pdf-to-word']))throw Error('PDF_OPERATIONS_LOST');
   let files=[input],last;
   for(const step of multi.steps){last=await runToolBatch(tools.find(t=>t.id===step.tool_id),files,step.params,runTool);files=resultFiles(last);}
   const zip=await JSZip.loadAsync(await last.blob.arrayBuffer()),xml=await zip.file('word/document.xml').async('text');
   if(!xml.includes('SECOND PAGE KEEP 123')||xml.includes('FIRST PAGE')||xml.includes('THIRD PAGE'))throw Error('PDF_WORD_CONTENT_MISMATCH');
   await archive(last.blob,'pagina-seleccionada.docx');
   const plain=new File(['Café, contenido 2026.\nTotal 123.'],'notas.txt',{type:'text/plain'});
   const txtReport=await assessFileConversions([plain],{run:runTool});
   if(!txtReport.includes('DOCX, PDF, TXT, HTML')||!txtReport.includes('Texto UTF-8'))throw Error('TXT_ASSESSMENT_INACCURATE');
   const txtPlan=planFileConversion('Convierte este archivo a PDF',[plain]);
   const generated=await runTool(txtPlan.steps[0].tool_id,[plain],txtPlan.steps[0].params);
   const readback=await runTool('pdf-text',[new File([generated.blob],generated.filename,{type:generated.blob.type})],{});
   if(!readback.text.includes('Café, contenido 2026.')||!readback.text.includes('Total 123.'))throw Error('TXT_PDF_TEXT_MISMATCH');
   await archive(generated.blob,'notas.pdf');
   const ambiguous=planFileConversion('Transforma este archivo',[plain]);
   if(ambiguous.type!=='needs-input'||ambiguous.steps.length)throw Error('AMBIGUOUS_TARGET_EXECUTED');
   const unsupported=planFileConversion('Convierte este archivo a MP3',[input]);
   if(unsupported.type!=='unsupported'||unsupported.steps.length)throw Error('UNSUPPORTED_TARGET_EXECUTED');
   return {cases:[{name:'pdf-read-only-assessment',reply:pdfReport},{name:'pdf-second-page-to-word',verifiedText:'SECOND PAGE KEEP 123',otherPagesAbsent:true},{name:'txt-assessment-and-pdf-content-readback',reply:txtReport,textPreserved:true},{name:'ambiguous-and-unsupported-requests',noExecution:true}],artifacts};
  });
  report.cases.push(...controls.cases);
  for(const artifact of controls.artifacts)fs.writeFileSync(out+'/'+artifact.name,Buffer.from(artifact.bytes));
  assert.equal(report.apiAttempts.some(x=>x.method==='POST'),false,'local assessment must not dispatch inference');
 }finally{
  fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
  await browser.close();await new Promise(r=>server.close(r));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
