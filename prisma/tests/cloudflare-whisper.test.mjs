// Mocked D1 + AI binding tests. No uploaded files leave the build machine, no model usage.
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/ai/transcribe.js';
import { OPENROUTER_VISITOR_LIMITS } from '../functions/_lib/limits.js';
import { AUDIO_MODELS, allowedModel } from '../functions/_lib/model-catalog.js';

assert.deepEqual(OPENROUTER_VISITOR_LIMITS,{perMinute:5,perDay:20});
assert.ok(allowedModel('cloudflare','audio','@cf/openai/whisper-large-v3-turbo'));
assert.equal(allowedModel('cloudflare','audio','@cf/unauthorized/model'),false);

const counts=new Map();
const db={
  prepare(sql){
    return {
      bind(...values){
        return {
          async first(){
            if(sql.includes('ai_provider_health'))return null;
            const [scope,windowStart,limit]=values;
            const key=scope+':'+windowStart;
            if(sql.startsWith('SELECT request_count'))
              return {request_count:counts.get(key)||0};
            if(sql.startsWith('INSERT INTO ai_rate_limits')){
              const used=counts.get(key)||0;
              if(used>=limit)return null;
              counts.set(key,used+1);
              return {request_count:used+1};
            }
            throw new Error('Unhandled D1 query: '+sql.slice(0,60));
          },
          async run(){return {success:true};}
        };
      }
    };
  }
};
const audio=Uint8Array.from([82,73,70,70,0,0,0,0,87,65,86,69]);
let calls=0;
let received;
const env={
  PRISMA_RATE_DB:db,
  AI:{async run(model,input){
    calls++;
    assert.equal(model,'@cf/openai/whisper-large-v3-turbo');
    received=Buffer.from(input.audio,'base64');
    assert.equal(input.task,'transcribe');
    assert.equal(input.language,'es');
    return {text:'Transcripción de prueba',word_count:3};
  }}
};
function request(model='@cf/openai/whisper-large-v3-turbo'){
  const form=new FormData();
  form.append('provider','cloudflare');
  form.append('model',model);
  form.append('language','es');
  form.append('file',new Blob([audio],{type:'audio/wav'}),'voz.wav');
  return new Request('https://prismaspace.pages.dev/api/ai/transcribe',{
    method:'POST',
    headers:{Origin:'https://prismaspace.pages.dev','CF-Connecting-IP':'198.51.100.9'},
    body:form
  });
}
const badModel=await onRequestPost({request:request('@cf/unauthorized/model'),env});
assert.equal(badModel.status,400,'Unknown models must be rejected before consuming quotas.');
const noBinding=await onRequestPost({request:request(),env:{PRISMA_RATE_DB:db}});
assert.equal(noBinding.status,503,'Transcription must be unavailable without Workers AI binding.');
for(let i=0;i<3;i++){
  const result=await onRequestPost({request:request(),env});
  assert.equal(result.status,200,'Within-budget transcription should succeed.');
  const body=await result.json();
  assert.equal(body.provider,'cloudflare');
  assert.equal(body.text,'Transcripción de prueba');
}
assert.deepEqual([...received], [...audio], 'Base64 audio must be byte-preserving.');
assert.equal(calls,3);
const exhausted=await onRequestPost({request:request(),env});
assert.equal(exhausted.status,429,'Fourth Cloudflare transcription must be blocked by D1.');
assert.equal(calls,3,'Exhausted requests must not spend Workers AI inference.');
console.log('Whisper regression: origin, allowlist, audio encoding and three-request D1 ceiling verified.');
