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
console.log('Provider orchestration regressions passed.');
