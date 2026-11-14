const path=require('node:path');
const tooling=process.env.QUEEN_TEST_TOOLING;
const dependency=name=>require(tooling?path.join(tooling,'node_modules',name):name);
const {Miniflare,convertV4MiniflareOptions}=dependency('miniflare');
const {build}=dependency('esbuild');
const fs=require('node:fs');
const repo=path.resolve(__dirname,'../..');
const reportDir=path.resolve(process.env.QUEEN_TEST_OUTPUT||'work/queen-runtime');
fs.mkdirSync(reportDir,{recursive:true});
const worker=path.resolve(process.env.QUEEN_TEST_WORKER||'work/queen-worker/index.js');
(async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,modulesRoot:path.dirname(worker),scriptPath:worker,compatibilityDate:'2026-11-08',d1Databases:{PRISMA_RATE_DB:'queen-local'},serviceBindings:{ASSETS:async()=>new Response('not found',{status:404})}}));
 const r=await mf.dispatchFetch('https://local/api/core/plan',{method:'POST',headers:{Origin:'https://local','Content-Type':'application/json'},body:JSON.stringify({text:'Consulta compleja',files:[]})});
 const disabled=await r.json();if(r.status!==503||disabled.code!=='QUEEN_DISABLED')throw Error(JSON.stringify(disabled));await mf.dispose();
 await build({stdin:{contents:`import {planWithQueen} from './prisma/functions/api/core/plan.js';
 export default {async fetch(request,env){
 const outcome=await planWithQueen(env,{text:'Interpreta estos datos y selecciona JSON format',files:[]},{loadProviders:async()=>[],infer:async()=>({plan:{intent:'execute',message:'Prueba',steps:[{id:'s1',tool_id:'json-format',params:{text:'{}'},dependsOn:[],inputs:[]}]},usage:{inputTokens:10,outputTokens:5}})});
 return Response.json(outcome);}};`,resolveDir:repo},bundle:true,platform:'browser',format:'esm',outfile:path.join(reportDir,'runtime-worker.mjs'),logLevel:'silent'});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,modulesRoot:reportDir,scriptPath:path.join(reportDir,'runtime-worker.mjs'),compatibilityDate:'2026-11-08',d1Databases:{PRISMA_RATE_DB:'queen-local'},bindings:{QUEEN_ENABLED:'1',QUEEN_API_KEY:'test-key',QUEEN_ACCESS_CLIENT_ID:'test-id',QUEEN_ACCESS_CLIENT_SECRET:'test-secret'}}));
 const db=(await runtime.getBindings()).PRISMA_RATE_DB;
 const sql=fs.readFileSync(path.join(repo,'prisma/migrations/0004_queen_control.sql'),'utf8').replace(/--[^\n]*/g,'');
 for(const command of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(command).run();
 const q=await runtime.dispatchFetch('https://local/test');const body=await q.json();
 if(!body.ok||body.source!=='queen'||body.plan.execution.executed)throw Error(JSON.stringify(body));
 const rows=await db.prepare('SELECT * FROM queen_metrics').all();if(rows.results[0]?.event!=='planned')throw Error('missing metric');
 const lease=await db.prepare('SELECT * FROM queen_leases').all();if(lease.results.length)throw Error('lease not released');
 const result={pagesEndpoint:{status:r.status,code:disabled.code},workerdD1:{planValidated:true,executed:false,metricsPersisted:true,leaseReleased:true}};
 fs.writeFileSync(path.join(reportDir,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await runtime.dispose();
})().catch(e=>{console.error(e);process.exit(1)});
