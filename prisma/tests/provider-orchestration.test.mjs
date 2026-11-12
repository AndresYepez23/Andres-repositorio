import assert from 'node:assert/strict';
import { rankProviders, adaptiveProviderDeadline, ROUTE_ORDER } from '../src/provider-routing.js';
import { getCredentialHealthSnapshot, requestWithCredentialPool } from '../functions/_lib/credential-pool.js';
import { getProviderHold } from '../functions/_lib/provider-health.js';

function mockD1() {
  const rows=new Map();
  return {
    rows,
    prepare(sql) {
      let values=[];
      const statement={
        bind(...args){values=args;return statement;},
        async first(){
          if(sql.includes('SELECT state, reason, valid_until FROM ai_provider_health WHERE provider=?')){
            const [provider,now]=values;
            const row=rows.get(provider);
            return row&&row.valid_until>now?row:null;
          }
          return null;
        },
        async all(){
          if(sql.includes('SELECT provider, state, reason, valid_until FROM ai_provider_health WHERE provider LIKE')){
            const [,now]=values;
            return {results:[...rows.entries()]
              .filter(([provider,row])=>provider.startsWith('credential-slot:v2:')&&row.valid_until>now)
              .map(([provider,row])=>({provider,...row}))};
          }
          return {results:[]};
        },
        async run(){
          if(sql.includes('INSERT INTO ai_provider_health')){
            const [provider,state,reason,valid_until]=values;
            rows.set(provider,{state,reason,valid_until});
          }
          return {success:true};
        }
      };
      return statement;
    }
  };
}

assert.equal(adaptiveProviderDeadline({baseMs:21000,minMs:12000}),21000,
  'Providers without history retain the normal timeout');
assert.equal(adaptiveProviderDeadline({averageMs:1000,baseMs:21000,minMs:12000}),12000,
  'Fast engines receive a shorter deadline so slow fallback can start sooner');
assert.equal(adaptiveProviderDeadline({averageMs:5000,baseMs:21000,minMs:12000}),15500,
  'Observed latency informs the per-engine deadline');
assert.equal(adaptiveProviderDeadline({averageMs:60000,baseMs:21000,minMs:12000}),21000,
  'A deadline never exceeds the task safety ceiling');

const now=Date.now();
const healthyOrder=rankProviders({task:'general',available:()=>true,now});
assert.deepEqual(healthyOrder,ROUTE_ORDER.general,'Healthy providers preserve the task-specialized route');
assert.equal(healthyOrder.at(-1),'openrouter','OpenRouter remains the final reserve');

const latencyOrder=rankProviders({
  task:'general',
  available:()=>true,
  now,
  health:{
    'groq:general':{at:now,averageMs:18000,failures:0,successes:0},
    'cloudflare:general':{at:now,averageMs:900,failures:0,successes:4}
  }
});
assert.ok(latencyOrder.indexOf('cloudflare')<latencyOrder.indexOf('groq'),
  'A consistently faster, successful engine can outrank a slow first-choice engine');

const coolingOrder=rankProviders({
  task:'general',
  available:()=>true,
  now,
  health:{'groq:general':{at:now,averageMs:1000,failures:4,successes:0,coolingUntil:now+60000}}
});
assert.notEqual(coolingOrder[0],'groq','A cooling provider is moved behind healthy alternatives');
assert.equal(rankProviders({preferred:'gemini',task:'general',available:()=>true,now})[0],'gemini',
  'Explicit provider selection remains first');

const db=mockD1();
const env={PRISMA_RATE_DB:db,GROQ_API_KEY:'groq-key-a',GROQ_API_KEY_2:'groq-key-b'};
let attempts=0;
const outage=await requestWithCredentialPool(env,'groq',async()=>{
  attempts++;
  return new Response('upstream unavailable',{status:503});
},{startIndex:0});
assert.equal(outage.status,503);
assert.equal(attempts,1,'A provider-wide 5xx must not be retried with another API key');
const providerHold=await getProviderHold(env,'groq');
assert.equal(providerHold?.state,'provider_unavailable','A 5xx opens a shared provider circuit breaker');
assert.equal((await getCredentialHealthSnapshot(env,['groq'])).groq.healthySlots,2,
  'A provider outage must not incorrectly mark individual API keys invalid');

const db2=mockD1();
const env2={PRISMA_RATE_DB:db2,GROQ_API_KEY:'groq-key-a',GROQ_API_KEY_2:'groq-key-b'};
let authAttempts=0;
const recovered=await requestWithCredentialPool(env2,'groq',async key=>{
  authAttempts++;
  return key==='groq-key-a'
    ?new Response('invalid key',{status:401})
    :new Response('ok',{status:200});
},{startIndex:0});
assert.equal(recovered.status,200,'A key-specific 401 should rotate to a different credential');
assert.equal(authAttempts,2);
const authSnapshot=await getCredentialHealthSnapshot(env2,['groq']);
assert.equal(authSnapshot.groq.healthySlots,1);
assert.equal(authSnapshot.groq.pausedSlots,1);

const db3=mockD1();
const env3={PRISMA_RATE_DB:db3,GROQ_API_KEY:'groq-key-only'};
let rateAttempts=0;
const limited=await requestWithCredentialPool(env3,'groq',async()=>{
  rateAttempts++;
  return new Response('rate limited',{status:429,headers:{'Retry-After':'120'}});
});
assert.equal(limited.status,429);
assert.equal(rateAttempts,1,'A provider-wide 429 must never rotate through other keys');
assert.equal((await getProviderHold(env3,'groq'))?.state,'rate_limited');

const db4=mockD1();
const env4={PRISMA_RATE_DB:db4,GROQ_API_KEY:'groq-key-only'};
const invalid=await requestWithCredentialPool(env4,'groq',async()=>new Response('invalid key',{status:401}));
assert.equal(invalid.status,401);
const pausedSnapshot=await getCredentialHealthSnapshot(env4,['groq']);
assert.equal(pausedSnapshot.groq.healthySlots,0);
assert.equal(pausedSnapshot.groq.pausedSlots,1);
await assert.rejects(
  requestWithCredentialPool(env4,'groq',async()=>new Response('should not be called',{status:200})),
  error=>error.code==='CREDENTIALS_PAUSED'&&error.status===503&&Number(error.retryAfter)>0,
  'All-invalid credentials are reported as paused without sending another request'
);

const fs=await import('node:fs');
const statusSource=fs.readFileSync(new URL('../functions/api/providers/status.js',import.meta.url),'utf8');
assert.match(statusSource,/getCredentialHealthSnapshot/,'Provider status checks every credential pool');
assert.match(statusSource,/providerHealth\.cloudflare/,'Cloudflare Workers AI has a visible shared health state');
const chatSource=fs.readFileSync(new URL('../functions/api/ai/chat.js',import.meta.url),'utf8');
assert.match(chatSource,/function providerFailure/,'Backend preserves provider error metadata');
assert.match(chatSource,/setProviderHold\(env,"cloudflare"/,'Cloudflare failures open a shared circuit breaker');
const engineSource=fs.readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(engineSource,/status:Number\(data\.status\)\|\|response\.status/,'The router retains the original upstream status');
const db5=mockD1();
const env5={PRISMA_RATE_DB:db5,GEMINI_API_KEY:'gemini-key'};
db5.rows.set('gemini',{state:'provider_unavailable',reason:'temporary outage',valid_until:Math.floor(Date.now()/1000)+60});
let fallbackAttempts=0;
const fallbackModel=await requestWithCredentialPool(env5,'gemini',async()=>{
  fallbackAttempts++;
  return new Response('fallback model ready',{status:200});
},{ignoreProviderHold:true});
assert.equal(fallbackModel.status,200,'An alternate model may be attempted inside the same Gemini provider after a transient model outage');
assert.equal(fallbackAttempts,1);
assert.ok(await getProviderHold(env5,'gemini'),'The original provider circuit remains recorded while the alternate model is attempted');

const db6=mockD1();
const env6={PRISMA_RATE_DB:db6,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'zai-key-'+(i+1)]))};
let zaiAttempts=0;
const zaiRecovered=await requestWithCredentialPool(env6,'zai',async(key)=>{
  zaiAttempts++;
  return key==='zai-key-6'?new Response('ok',{status:200}):new Response('invalid key',{status:401});
},{sweepAuthSlots:true,startIndex:0});
assert.equal(zaiRecovered.status,200,'Z.AI checks all configured slots after key-specific authentication failures');
assert.equal(zaiAttempts,6);


const db7=mockD1();
const env7={PRISMA_RATE_DB:db7,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'independent-zai-account-'+(i+1)]))};
let independentZaiAttempts=0;
const independentZai=await requestWithCredentialPool(env7,'zai',async(key)=>{
  independentZaiAttempts++;
  return key==='independent-zai-account-6'
    ? new Response('ok',{status:200})
    : new Response(JSON.stringify({error:{code:'1308',message:'account rate limited'}}),{status:429});
},{sweepAuthSlots:true,sweepQuotaSlots:true,startIndex:0});
assert.equal(independentZai.status,200,'Z.AI must try the next independent account after a per-account 429');
assert.equal(independentZaiAttempts,6,'All six Z.AI accounts are checked until one succeeds');
assert.equal(await getProviderHold(env7,'zai'),null,'A rate limit on one independent account must not open a provider-wide circuit');

const db8=mockD1();
const env8={PRISMA_RATE_DB:db8,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'limited-zai-account-'+(i+1)]))};
let allLimitedAttempts=0;
const allLimited=await requestWithCredentialPool(env8,'zai',async()=>{
  allLimitedAttempts++;
  return new Response(JSON.stringify({error:{code:'1308',message:'account rate limited'}}),{status:429});
},{sweepAuthSlots:true,sweepQuotaSlots:true,startIndex:0});
assert.equal(allLimited.status,429,'Return the last upstream limit if every independent account is limited');
assert.equal(allLimitedAttempts,6,'A rate limit is isolated and recorded for each of the six independent accounts');
assert.equal(await getProviderHold(env8,'zai'),null,'Exhausted independent accounts must not create a global provider hold');



const db9=mockD1();
const env9={PRISMA_RATE_DB:db9,...Object.fromEntries(Array.from({length:6},(_,i)=>['HF_TOKEN'+(i===0?'':'_'+(i+1)),'independent-hf-account-'+(i+1)]))};
let hfAttempts=0;
const hfRecovered=await requestWithCredentialPool(env9,'huggingface',async(key)=>{
  hfAttempts++;
  return key==='independent-hf-account-6'
    ? new Response('ok',{status:200})
    : new Response(JSON.stringify({error:{message:'monthly credits exhausted'}}),{status:402});
},{sweepQuotaSlots:true,startIndex:0});
assert.equal(hfRecovered.status,200,'Hugging Face must try another independent account after one account exhausts credits');
assert.equal(hfAttempts,6,'All six configured Hugging Face accounts are checked until one succeeds');
assert.equal(await getProviderHold(env9,'huggingface'),null,'One Hugging Face account quota must not pause all independent accounts');

const db10=mockD1();
const env10={PRISMA_RATE_DB:db10,...Object.fromEntries(Array.from({length:6},(_,i)=>['HF_TOKEN'+(i===0?'':'_'+(i+1)),'exhausted-hf-account-'+(i+1)]))};
let hfLimitedAttempts=0;
const hfAllLimited=await requestWithCredentialPool(env10,'huggingface',async()=>{
  hfLimitedAttempts++;
  return new Response(JSON.stringify({error:{message:'monthly credits exhausted'}}),{status:402});
},{sweepQuotaSlots:true,startIndex:0});
assert.equal(hfAllLimited.status,402,'Return HTTP 402 when every independent Hugging Face account is out of credits');
assert.equal(hfLimitedAttempts,6,'All six exhausted Hugging Face accounts are checked independently');
assert.equal(await getProviderHold(env10,'huggingface'),null,'Exhausted Hugging Face accounts must not create a global provider hold');


const db11=mockD1();
const env11={PRISMA_RATE_DB:db11,...Object.fromEntries(Array.from({length:3},(_,i)=>['REQUESTY_API_KEY'+(i===0?'':'_'+(i+1)),'independent-requesty-account-'+(i+1)]))};
let requestyAttempts=0;
const requestyRecovered=await requestWithCredentialPool(env11,'requesty',async(key)=>{
  requestyAttempts++;
  return key==='independent-requesty-account-3'
    ? new Response(JSON.stringify({ok:true}),{status:200})
    : new Response(JSON.stringify({error:{code:'FORBIDDEN',message:'account/model permission denied'}}),{status:403});
},{sweepAuthSlots:true,retryStatuses:[401,403],startIndex:0});
assert.equal(requestyRecovered.status,200,'Requesty must try the next independent account after one account returns 403');
assert.equal(requestyAttempts,3,'All three Requesty accounts are checked until one succeeds');

const db12=mockD1();
const env12={PRISMA_RATE_DB:db12,...Object.fromEntries(Array.from({length:3},(_,i)=>['REQUESTY_API_KEY'+(i===0?'':'_'+(i+1)),'forbidden-requesty-account-'+(i+1)]))};
let requestyForbiddenAttempts=0;
const requestyAllForbidden=await requestWithCredentialPool(env12,'requesty',async()=>{
  requestyForbiddenAttempts++;
  return new Response(JSON.stringify({error:{code:'FORBIDDEN',message:'account/model permission denied'}}),{status:403});
},{sweepAuthSlots:true,retryStatuses:[401,403],startIndex:0});
assert.equal(requestyAllForbidden.status,403,'Return HTTP 403 when all independent Requesty accounts are forbidden');
assert.equal(requestyForbiddenAttempts,3,'All three Requesty accounts are checked independently');

console.log('Provider orchestration regressions passed.');
