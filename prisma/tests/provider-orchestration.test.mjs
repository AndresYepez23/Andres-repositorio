import assert from 'node:assert/strict';
import { rankProviders, adaptiveProviderDeadline, ROUTE_ORDER } from '../src/provider-routing.js';
import { getCredentialHealthSnapshot, getCredentialMetricsSnapshot, requestWithCredentialPool } from '../functions/_lib/credential-pool.js';
import { getProviderHold } from '../functions/_lib/provider-health.js';
import { getProviderDailyCapacity, getProviderMinuteCapacity } from '../functions/_lib/limits.js';

function mockD1() {
  const rows=new Map();
  const counters=new Map();
  const counterKey=(scope,windowStart)=>String(scope)+":"+String(windowStart);
  return {
    rows,counters,
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
          if(sql.includes('INSERT INTO ai_rate_limits')&&sql.includes('RETURNING request_count')){
            const [scope,windowStart]=values;
            const key=counterKey(scope,windowStart);
            const next=(counters.get(key)||0)+1;
            counters.set(key,next);
            return {request_count:next};
          }
          if(sql.includes('SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=?')){
            const [scope,windowStart]=values;
            const value=counters.get(counterKey(scope,windowStart));
            return value==null?null:{request_count:value};
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
          if(sql.includes('SELECT scope, window_start, request_count FROM ai_rate_limits WHERE scope LIKE')){
            return {results:[...counters.entries()]
              .filter(([key])=>key.startsWith('credential:'))
              .map(([key,request_count])=>{
                const split=key.lastIndexOf(":");
                const scope=key.slice(0,split),window_start=Number(key.slice(split+1));
                return {scope,window_start,request_count};
              })};
          }
          return {results:[]};
        },
        async run(){
          if(sql.includes('INSERT INTO ai_provider_health')){
            const [provider,state,reason,valid_until]=values;
            rows.set(provider,{state,reason,valid_until});
          }
          if(sql.includes('INSERT INTO ai_rate_limits')){
            const [scope,windowStart,value]=values;
            const key=counterKey(scope,windowStart);
            const previous=counters.get(key)||0;
            counters.set(key,sql.includes('request_count=ai_rate_limits.request_count+excluded.request_count')?previous+Number(value||0):Number(value||0));
          }
          if(sql.includes('UPDATE ai_rate_limits SET request_count=request_count-1')){
            const [scope,windowStart]=values;
            const key=counterKey(scope,windowStart);
            counters.set(key,Math.max(0,(counters.get(key)||0)-1));
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

const capacityEnv={
  PRISMA_SENSENOVA_DAILY_LIMIT:'100',
  SENSENOVA_API_KEY:'sense-a',
  SENSENOVA_API_KEY_2:'sense-b',
  SENSENOVA_API_KEY_3:'sense-c'
};
assert.equal(getProviderDailyCapacity(capacityEnv,'sensenova'),300,
  'The app-side ceiling scales with three independent SenseNova accounts instead of throttling the whole provider at 100');
const aihubmixCapacityEnv={
  AIHUBMIX_API_KEY:'mix-a',
  AIHUBMIX_API_KEY_2:'mix-b'
};
assert.equal(getProviderMinuteCapacity(aihubmixCapacityEnv,'aihubmix'),20,
  'AIHubMix minute capacity is allocated per configured account');
const aihubmixPaidEnv={
  AIHUBMIX_DAILY_QUOTA_ACTIVE:'1',
  AIHUBMIX_API_KEY:'mix-a',
  AIHUBMIX_API_KEY_2:'mix-b',
  AIHUBMIX_API_KEY_3:'mix-c',
  AIHUBMIX_API_KEY_4:'mix-d',
  AIHUBMIX_API_KEY_5:'mix-e'
};
assert.equal(getProviderDailyCapacity(aihubmixPaidEnv,'aihubmix'),500,
  "AIHubMix's verified 100-request daily quota is multiplied across five separately configured accounts");

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
assert.deepEqual(authSnapshot.groq.pausedSlotNumbers,[1],'Provider status must know exactly which key slots are on authentication cooldown');

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
assert.match(statusSource,/getCredentialMetricsSnapshot/,'Provider status uses private per-key telemetry to calculate aggregate health');
assert.doesNotMatch(statusSource,/credentialUsage|slotsWithMetrics/,'Public provider status never serializes per-key balance or usage telemetry');
assert.match(statusSource,/getProviderDailyCapacity/,'Provider status reports capacity scaled across independent account pools');
assert.match(statusSource,/providerHealth\.cloudflare/,'Cloudflare Workers AI has a visible shared health state');
const chatSource=fs.readFileSync(new URL('../functions/api/ai/chat.js',import.meta.url),'utf8');
assert.match(chatSource,/function providerFailure/,'Backend preserves provider error metadata');
assert.match(chatSource,/setProviderHold\(env,"cloudflare"/,'Cloudflare failures open a shared circuit breaker');
assert.match(chatSource,/sweepRateLimitSlots:\["zai","sensenova","aihubmix"\]\.includes\(provider\)/,'Only providers with independent account rate limits sweep 429 across keys');
const engineSource=fs.readFileSync(new URL('../src/engines.js',import.meta.url),'utf8');
assert.match(engineSource,/status:Number\(data\.status\)\|\|response\.status/,'The router retains the original upstream status');
assert.match(engineSource,/p\.centralProviderUsage\|\|\{\}/,'The intelligent router uses shared provider utilization, not only this browser session');
const coreSource=fs.readFileSync(new URL('../src/core.js',import.meta.url),'utf8');
assert.match(coreSource,/centralProviderUsage/,'Prisma Core passes central usage metrics into the model router');
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
},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0});
assert.equal(independentZai.status,200,'Z.AI must try the next independent account after a per-account 429');
assert.equal(independentZaiAttempts,6,'All six Z.AI accounts are checked until one succeeds');
assert.equal(await getProviderHold(env7,'zai'),null,'A rate limit on one independent account must not open a provider-wide circuit');

const db8=mockD1();
const env8={PRISMA_RATE_DB:db8,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'limited-zai-account-'+(i+1)]))};
let allLimitedAttempts=0;
const allLimited=await requestWithCredentialPool(env8,'zai',async()=>{
  allLimitedAttempts++;
  return new Response(JSON.stringify({error:{code:'1308',message:'account rate limited'}}),{status:429});
},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0});
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

const db13=mockD1();
const env13={PRISMA_RATE_DB:db13,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'independent-zai-403-account-'+(i+1)]))};
let zai403Attempts=0;
const zai403Recovered=await requestWithCredentialPool(env13,'zai',async(key)=>{
  zai403Attempts++;
  return key==='independent-zai-403-account-6'
    ? new Response('ok',{status:200})
    : new Response(JSON.stringify({error:{code:'PERMISSION_DENIED',message:'account/model permission denied'}}),{status:403});
},{sweepAuthSlots:true,sweepQuotaSlots:true,retryStatuses:[401,403],startIndex:0});
assert.equal(zai403Recovered.status,200,'Z.AI must try the next independent account after a key-specific HTTP 403');
assert.equal(zai403Attempts,6,'All six Z.AI accounts are checked until one succeeds after HTTP 403');
assert.equal(await getProviderHold(env13,'zai'),null,'A single Z.AI account permission rejection must not pause the entire provider');

const db14=mockD1();
const env14={PRISMA_RATE_DB:db14,...Object.fromEntries(Array.from({length:6},(_,i)=>['ZAI_API_KEY'+(i===0?'':'_'+(i+1)),'forbidden-zai-403-account-'+(i+1)]))};
let zaiAllForbiddenAttempts=0;
const zaiAllForbidden=await requestWithCredentialPool(env14,'zai',async()=>{
  zaiAllForbiddenAttempts++;
  return new Response(JSON.stringify({error:{code:'PERMISSION_DENIED',message:'account/model permission denied'}}),{status:403});
},{sweepAuthSlots:true,sweepQuotaSlots:true,retryStatuses:[401,403],startIndex:0});
assert.equal(zaiAllForbidden.status,403,'Return HTTP 403 when all independent Z.AI accounts reject the request');
assert.equal(zaiAllForbiddenAttempts,6,'All six Z.AI accounts are checked independently after HTTP 403');
assert.equal(await getProviderHold(env14,'zai'),null,'Six independent Z.AI permission rejections must not create a provider-wide hold');


const balancedOrder=rankProviders({
  task:'general',
  available:()=>true,
  usage:{
    groq:{daily:{used:100,limit:100}},
    cloudflare:{daily:{used:0,limit:100}}
  }
});
assert.equal(balancedOrder[0],'cloudflare',
  'The router distributes compatible tasks away from a provider whose shared pool is saturated');
const secondBalancedOrder=rankProviders({
  task:'general',
  available:()=>true,
  usage:{
    groq:{daily:{used:1,limit:5000}},
    cloudflare:{daily:{used:1,limit:5000}}
  }
});
assert.equal(secondBalancedOrder[0],'gemini',
  'Weighted fair routing cycles to the next compatible provider instead of permanently preferring the first one');

const db15=mockD1();
const env15={PRISMA_RATE_DB:db15,GROQ_API_KEY:'round-robin-a',GROQ_API_KEY_2:'round-robin-b',GROQ_API_KEY_3:'round-robin-c'};
const rotation=[];
for(let i=0;i<6;i++){
  const response=await requestWithCredentialPool(env15,'groq',async key=>{
    rotation.push(key);
    return new Response(JSON.stringify({usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}),{status:200,headers:{'Content-Type':'application/json'}});
  },{sweepAuthSlots:true});
  assert.equal(response.status,200);
}
assert.deepEqual(rotation,['round-robin-a','round-robin-b','round-robin-c','round-robin-a','round-robin-b','round-robin-c'],
  'Credential selection uses a persistent round-robin cursor instead of a random starting key');
const credentialMetrics=await getCredentialMetricsSnapshot(env15,['groq']);
assert.equal(credentialMetrics.groq[1].requestsToday,2,'Successful requests are attributed to the exact credential slot');
assert.equal(credentialMetrics.groq[1].tokensToday,10,'Token usage is attributed to the exact credential slot');

const dbHeaderMetrics=mockD1();
const envHeaderMetrics={PRISMA_RATE_DB:dbHeaderMetrics,ZAI_API_KEY:'zai-rate-a',ZAI_API_KEY_2:'zai-rate-b'};
const headerCalls=[];
const firstHeaderResponse=await requestWithCredentialPool(envHeaderMetrics,'zai',async key=>{
  headerCalls.push(key);
  return new Response('ok',{status:200,headers:{
    'X-RateLimit-Limit-Requests':'100',
    'X-RateLimit-Remaining-Requests':'0',
    'X-RateLimit-Reset-Requests':String(Math.floor(Date.now()/1000)+60)
  }});
},{sweepAuthSlots:true,sweepRateLimitSlots:true,startIndex:0});
assert.equal(firstHeaderResponse.status,200);
const secondHeaderResponse=await requestWithCredentialPool(envHeaderMetrics,'zai',async key=>{
  headerCalls.push(key);
  return new Response('ok',{status:200});
},{sweepAuthSlots:true,sweepRateLimitSlots:true,startIndex:0});
assert.equal(secondHeaderResponse.status,200);
assert.deepEqual(headerCalls,['zai-rate-a','zai-rate-b'],
  'A key with zero remaining requests is skipped until its provider-reported reset time');

const dbOutage=mockD1();
const envOutage={PRISMA_RATE_DB:dbOutage,ZAI_API_KEY:'zai-outage-a',ZAI_API_KEY_2:'zai-outage-b'};
await assert.rejects(
  requestWithCredentialPool(envOutage,'zai',async()=>{throw new Error('upstream network unavailable');},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0}),
  error=>error.code==='PROVIDER_UNAVAILABLE'
);
let outageRetryAttempts=0;
await assert.rejects(
  requestWithCredentialPool(envOutage,'zai',async()=>{outageRetryAttempts++;return new Response('ok',{status:200});},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0}),
  error=>error.code==='PROVIDER_COOLDOWN'
);
assert.equal(outageRetryAttempts,0,'Independent account rotation must never bypass a provider-wide network circuit breaker');

const dbRate=mockD1();
const envRate={PRISMA_RATE_DB:dbRate,GROQ_API_KEY:'groq-org-a',GROQ_API_KEY_2:'groq-org-b',GROQ_API_KEY_3:'groq-org-c'};
let sharedRateAttempts=0;
const sharedRate=await requestWithCredentialPool(envRate,'groq',async()=>{
  sharedRateAttempts++;
  return new Response('organization rate limited',{status:429,headers:{'Retry-After':'60'}});
},{sweepAuthSlots:true,sweepQuotaSlots:true,startIndex:0});
assert.equal(sharedRate.status,429,'Shared organization rate limits remain provider-wide');
assert.equal(sharedRateAttempts,1,'A shared 429 is not retried through every API key');

const db16=mockD1();
const env16={PRISMA_RATE_DB:db16,...Object.fromEntries(Array.from({length:6},(_,i)=>['SENSENOVA_API_KEY'+(i===0?'':'_'+(i+1)),'independent-sensenova-account-'+(i+1)]))};
let sensenovaAttempts=0;
const sensenovaRecovered=await requestWithCredentialPool(env16,'sensenova',async key=>{
  sensenovaAttempts++;
  return key==='independent-sensenova-account-6'?new Response('ok',{status:200}):new Response('account quota exhausted',{status:429});
},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0});
assert.equal(sensenovaRecovered.status,200,'SenseNova rotates through independent accounts after per-account 429');
assert.equal(sensenovaAttempts,6);

const db17=mockD1();
const env17={PRISMA_RATE_DB:db17,...Object.fromEntries(Array.from({length:5},(_,i)=>['AIHUBMIX_API_KEY'+(i===0?'':'_'+(i+1)),'independent-aihubmix-account-'+(i+1)]))};
let aihubmixAttempts=0;
const aihubmixRecovered=await requestWithCredentialPool(env17,'aihubmix',async key=>{
  aihubmixAttempts++;
  return key==='independent-aihubmix-account-5'?new Response('ok',{status:200}):new Response('account quota exhausted',{status:402});
},{sweepAuthSlots:true,sweepQuotaSlots:true,sweepRateLimitSlots:true,startIndex:0});
assert.equal(aihubmixRecovered.status,200,'AIHubMix rotates to the next account when one account has no remaining quota');
assert.equal(aihubmixAttempts,5);

const db18=mockD1();
const env18={PRISMA_RATE_DB:db18,OPENROUTER_API_KEY:'openrouter-key-a',OPENROUTER_API_KEY_2:'openrouter-key-b'};
let openrouterKeyAttempts=0;
const openrouterKeyRecovered=await requestWithCredentialPool(env18,'openrouter',async key=>{
  openrouterKeyAttempts++;
  return key==='openrouter-key-b'?new Response('ok',{status:200}):new Response(JSON.stringify({error:{metadata:{limit_source:'openrouter_key_limit'}}}),{status:402,headers:{'Content-Type':'application/json'}});
},{sweepAuthSlots:true,startIndex:0});
assert.equal(openrouterKeyRecovered.status,200,'OpenRouter rotates only when a 402 explicitly identifies a per-key spend cap');
assert.equal(openrouterKeyAttempts,2);

console.log('Provider orchestration regressions passed.');
