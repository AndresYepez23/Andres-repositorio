import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialPromotionHandler} from '../neural-pilot/staging/credential-promotion.mjs';

const encoder=new TextEncoder();
const nonce='42'.repeat(32);
const names=['QUEEN_ACCESS_CLIENT_ID','QUEEN_ACCESS_CLIENT_SECRET','QUEEN_API_KEY'];
const stageDatabase='980bad8f-0356-48b9-87bc-56bcf363f69a';
const values={QUEEN_ACCESS_CLIENT_ID:'fixture-access-client',QUEEN_ACCESS_CLIENT_SECRET:'fixture-access-secret',QUEEN_API_KEY:'fixture-model-secret'};
const keyPair=crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
const bytes=value=>new Uint8Array(Buffer.from(value,'base64'));

async function config(changes={}){
 const pair=await keyPair;
 return {publicKeyJwk:await crypto.subtle.exportKey('jwk',pair.publicKey),nonceSha256:hex(await crypto.subtle.digest('SHA-256',encoder.encode(nonce))),
  expiresAt:Date.now()+5*60*1000,sourceCommit:'a'.repeat(40),destination:'prismaspace',accountId:'26c2a31382f903f4ce4f5f7bafbd6820',...changes};
}
function database(identity=stageDatabase){
 const rows=new Map(),calls=[];
 return {rows,calls,prepare(sql){
  return {async first(){
   calls.push({sql,parameters:[]});
   if(sql.includes('queen_staging_identity'))return {database_id:identity,environment:'staging'};
   throw Error('Unexpected unbound fixture first call');
  },bind(...parameters){
   calls.push({sql,parameters});
   return {async first(){
    if(!/^SELECT\s/i.test(sql))throw Error('Unexpected fixture first call');
    if(sql.includes('queen_staging_identity'))return {database_id:identity,environment:'staging'};
    const row=rows.get(parameters[0]);return row?{...row}:null;
   },async run(){
    if(!/^INSERT\s/i.test(sql))throw Error('Unexpected fixture run call');
    const [slot,owner,expires_at]=parameters;
    const added=!rows.has(slot);if(added)rows.set(slot,{owner,expires_at});
    return {success:true,meta:{changes:added?1:0}};
   }};
  }};
 }};
}
const request=(nonceValue=nonce,method='POST',path='/__queen/credential-promotion')=>new Request('https://private-stage.example'+path,{method,headers:{'X-Queen-Promotion-Nonce':nonceValue}});
const environment=db=>({...values,QUEEN_CONTROL_DB:db,QUEEN_STAGE:'staging',QUEEN_STAGING_DATABASE_ID:stageDatabase,
 QUEEN_SOURCE_COMMIT:'a'.repeat(40),UNRELATED_SECRET:'fixture-unrelated-do-not-export'});
async function decrypt(envelope){
 const pair=await keyPair;
 const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,bytes(envelope.wrappedKey));
 const aes=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
 const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:bytes(envelope.associatedData)},aes,bytes(envelope.ciphertext));
 return JSON.parse(new TextDecoder().decode(data));
}
function assertNoPlaintext(serialized){
 for(const value of Object.values(values))assert.ok(!serialized.includes(value));
 assert.ok(!serialized.includes('fixture-unrelated-do-not-export'));
}

test('promotion is absent without configuration and unrelated routes remain untouched',async()=>{
 const db=database();
 assert.equal(await createCredentialPromotionHandler(null)(request(),environment(db)),null);
 assert.equal(await createCredentialPromotionHandler(await config())(request(nonce,'POST','/__queen/health'),environment(db)),null);
 assert.equal(db.calls.length,0);
});

test('promotion rejects wrong methods and nonce before reading credentials or storage',async()=>{
 const handler=createCredentialPromotionHandler(await config());
 let reads=0;
 const env=new Proxy({}, {get(){reads++;throw Error('Fixture credential must not be read');}});
 assert.equal((await handler(request(nonce,'GET'),env)).status,405);
 assert.equal((await handler(request('43'.repeat(32)),env)).status,404);
 assert.equal((await handler(request('not-a-nonce'),env)).status,404);
 assert.equal(reads,0);
});

test('promotion expires and refuses overlong or malformed destination configuration',async()=>{
 const db=database();
 assert.equal((await createCredentialPromotionHandler(await config({expiresAt:Date.now()-1}))(request(),environment(db))).status,410);
 for(const changes of [{expiresAt:Date.now()+16*60*1000},{expiresAt:NaN},{destination:'other-project'},{accountId:'0'.repeat(32)},{sourceCommit:'invalid'},{nonceSha256:'invalid'}]){
  const response=await createCredentialPromotionHandler(await config(changes))(request(),environment(db));
  assert.equal(response.status,503);assertNoPlaintext(await response.text());
 }
 assert.equal(db.calls.length,0);
});

test('real hybrid encryption promotes exactly the three credentials and binds its destination',async()=>{
 const db=database(),settings=await config();
 const response=await createCredentialPromotionHandler(settings)(request(),environment(db));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const text=await response.text();assertNoPlaintext(text);
 const envelope=JSON.parse(text);
 assert.equal(envelope.version,1);assert.equal(envelope.algorithm,'RSA-OAEP-256+A256GCM');
 assert.equal(bytes(envelope.iv).length,12);
 const associated=JSON.parse(new TextDecoder().decode(bytes(envelope.associatedData)));
 assert.deepEqual(associated,{purpose:'queen-credential-promotion',sourceCommit:settings.sourceCommit,destination:settings.destination,accountId:settings.accountId,nonceSha256:settings.nonceSha256});
 const payload=await decrypt(envelope);
 assert.equal(payload.purpose,'queen-credential-promotion');
 assert.equal(payload.sourceCommit,settings.sourceCommit);assert.equal(payload.destination,settings.destination);assert.equal(payload.accountId,settings.accountId);
 assert.deepEqual(Object.keys(payload.credentials).sort(),names.slice().sort());assert.deepEqual(payload.credentials,values);
 assertNoPlaintext(JSON.stringify([...db.rows]));
 assert.ok([...db.rows.keys()].every(slot=>slot.startsWith('credential-promotion:')&&slot!=='queen'));
 const tampered={...envelope,ciphertext:Buffer.from(bytes(envelope.ciphertext).map((v,i)=>i===0?v^1:v)).toString('base64')};
 await assert.rejects(decrypt(tampered));
});

test('retries and concurrent callers return one stored ciphertext without changing the model lease',async()=>{
 const db=database(),settings=await config();
 db.rows.set('queen',{owner:'existing-model-lease',expires_at:Date.now()+60000});
 const handler=createCredentialPromotionHandler(settings),env=environment(db);
 const results=await Promise.all(Array.from({length:5},()=>handler(request(),env)));
 const bodies=await Promise.all(results.map(async response=>{assert.equal(response.status,200);return response.text();}));
 assert.ok(bodies.every(value=>value===bodies[0]));
 const retryEnv=environment(db);for(const name of names)delete retryEnv[name];
 const retry=await handler(request(),retryEnv);
 assert.equal(retry.status,200);assert.equal(await retry.text(),bodies[0]);
 assert.equal(db.rows.size,2);assert.equal(db.rows.get('queen').owner,'existing-model-lease');
 assertNoPlaintext(JSON.stringify([...db.rows]));
});

test('promotion uses dedicated control storage and fails closed without source credentials',async()=>{
 const db=database(),handler=createCredentialPromotionHandler(await config());
 const principal={prepare(){throw Error('Principal storage must not be accessed');}};
 const response=await handler(request(),{...environment(db),PRISMA_RATE_DB:principal});
 assert.equal(response.status,200);
 for(const changes of [{QUEEN_API_KEY:''},{QUEEN_API_KEY:'x'.repeat(4097)},{QUEEN_ACCESS_CLIENT_SECRET:null}]){
  const isolated=database();
  const failed=await createCredentialPromotionHandler(await config())(request(),{...environment(isolated),...changes});
  assert.equal(failed.status,503);assertNoPlaintext(await failed.text());assert.equal(isolated.rows.size,0);
 }
});

test('storage and cryptographic failures return fixed errors with no credential values',async()=>{
 const handler=createCredentialPromotionHandler(await config());
 for(const db of [undefined,{}, {prepare(){throw Error('fixture-model-secret fixture-access-secret');}}]){
  const response=await handler(request(),environment(db));
  assert.equal(response.status,503);assertNoPlaintext(await response.text());
 }
 const invalid=await config({publicKeyJwk:{kty:'RSA',n:'invalid',e:'AQAB'}});
 const response=await createCredentialPromotionHandler(invalid)(request(),environment(database()));
 assert.equal(response.status,503);assertNoPlaintext(await response.text());
});

test('promotion requires the isolated staging environment and actual database identity before credentials',async()=>{
 for(const mutate of [env=>{env.QUEEN_STAGE='production';},env=>{env.QUEEN_STAGING_DATABASE_ID='e02104b5-0861-475a-a60f-7658439d4fe0';},env=>{env.QUEEN_SOURCE_COMMIT='b'.repeat(40);},()=>{}]){
  const db=database('e02104b5-0861-475a-a60f-7658439d4fe0'),env=environment(db);
  mutate(env);let reads=0;
  for(const name of names)Object.defineProperty(env,name,{get(){reads++;throw Error('Secret getter must not run');}});
  const response=await createCredentialPromotionHandler(await config())(request(),env);
  assert.equal(response.status,503);assert.equal(reads,0);assert.equal(db.rows.size,0);
 }
});

test('accepted maximum-length UTF-8 credentials still produce a usable encrypted capsule',async()=>{
 const db=database(),unicode=Object.fromEntries(names.map((name,index)=>[name,String.fromCharCode(233+index).repeat(4096)]));
 const response=await createCredentialPromotionHandler(await config())(request(),{...environment(db),...unicode});
 assert.equal(response.status,200);
 const serialized=await response.text();
 for(const value of Object.values(unicode))assert.ok(!serialized.includes(value));
 const payload=await decrypt(JSON.parse(serialized));
 assert.deepEqual(payload.credentials,unicode);
 for(const value of Object.values(unicode))assert.ok(!JSON.stringify([...db.rows]).includes(value));
});
