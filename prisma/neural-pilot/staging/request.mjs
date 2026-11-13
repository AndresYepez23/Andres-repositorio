// Reproducible operator request. Queen credentials never leave Cloudflare.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const base=new URL(arg('base')||process.env.QUEEN_STAGING_URL||'https://prisma-queen-staging.pages.dev');
if(base.protocol!=='https:'||!(base.hostname==='prisma-queen-staging.pages.dev'||base.hostname.endsWith('.prisma-queen-staging.pages.dev'))||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('STAGING_HOST_REQUIRED');
const route=arg('route')||'health';
if(!['health','models','server','local-tools','guards','auth-controls','schema-controls','context','timeout','stream','truncation','case','compose','plan','providers','local-routing','product-plan'].includes(route))throw Error('UNKNOWN_ROUTE');
const keyfile=process.env.QUEEN_STAGING_OPERATOR_KEY_FILE;if(!keyfile)throw Error('OPERATOR_KEY_FILE_REQUIRED');
const key=(await readFile(keyfile,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_OPERATOR_KEY_FILE');
const body=JSON.parse(arg('body')||'{}'),output=resolve(arg('output')||'work/queen-'+route+'-'+Date.now()+'.json');
await mkdir(dirname(output),{recursive:true});await writeFile(output,'',{flag:'wx'});
const parameters=['--silent','--show-error','--max-time','135','--config','-','--write-out','\n%{http_code}',base.origin+(route==='product-plan'?'/api/core/plan':'/__queen/'+route)];
if(route!=='health')parameters.push('--request','POST','--header','Origin: '+base.origin,'--header','Content-Type: application/json','--data',JSON.stringify(body));
const began=Date.now(),at=new Date().toISOString();
const result=await new Promise(resolve=>{
 const child=spawn('curl',parameters,{stdio:['pipe','pipe','pipe']});let raw='',bytes=0;
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024)child.kill();else raw+=chunk;});child.stderr.resume();
 child.stdin.end('header = "X-Queen-Staging-Key: '+key+'"\n');
 child.on('error',()=>resolve({httpStatus:0,body:{code:'REQUEST_FAILED'}}));
 child.on('close',code=>{const split=raw.lastIndexOf('\n');let data;try{data=JSON.parse(raw.slice(0,split));}catch{data={code:'NON_JSON_RESPONSE'};}
  resolve({httpStatus:code===0?Number(raw.slice(split+1)):0,body:data});});
});
await writeFile(output,JSON.stringify({at,base:base.origin,route,clientDurationMs:Date.now()-began,...result},null,2)+'\n');
console.log(JSON.stringify({output,httpStatus:result.httpStatus,ok:result.body.ok??null,code:result.body.code??null}));
