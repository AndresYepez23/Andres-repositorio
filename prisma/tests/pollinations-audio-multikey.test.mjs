import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getProviderDailyCapacity} from '../functions/_lib/limits.js';
const speech=readFileSync(new URL('../functions/api/ai/speech.js',import.meta.url),'utf8');
test('Pollinations audio allowance scales with unique configured keys, max six',()=>{
 assert.equal(getProviderDailyCapacity({POLLINATIONS_API_KEY:'sk_test_a'},'pollinations-audio'),2);
 assert.equal(getProviderDailyCapacity({POLLINATIONS_API_KEYS_JSON:JSON.stringify(['sk_test_a','sk_test_b','sk_test_c'])},'pollinations-audio'),6);
 assert.equal(getProviderDailyCapacity({POLLINATIONS_API_KEYS_JSON:JSON.stringify(['sk_test_a','sk_test_a'])},'pollinations-audio'),2);
 assert.equal(getProviderDailyCapacity({POLLINATIONS_API_KEYS_JSON:JSON.stringify(Array.from({length:6},(_,i)=>'sk_test_'+i))},'pollinations-audio'),12);
});
test('Speech tries independent credential slots on auth, quota and rate-limit errors',()=>{
 assert.match(speech,/sweepQuotaSlots:true,sweepAuthSlots:true,sweepRateLimitSlots:true/);
 assert.match(speech,/getCredentialSlots\(env,"pollinations"\)\.length<=1/);
});
