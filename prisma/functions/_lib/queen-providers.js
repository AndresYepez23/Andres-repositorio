import {rankProviders,selectTaskModel} from '../../src/provider-routing.js';
import {onRequestGet as providerStatus} from '../api/providers/status.js';
import {readQueenProviderObservations} from './queen-observations.js';

// A projection of existing routing/catalog/health, never a competing provider list.
export function buildQueenProviderRegistry(status,metrics={},observations=[]){
 return Object.keys(status.providers||{}).filter(id=>!['amd','baidu'].includes(id)).map(id=>{
  const health=status.providerHealth?.[id]||{};
  const samples=Object.values(metrics[id]||{});
  const lastSuccess=Math.max(0,...samples.map(m=>Number(m.lastSuccessAt)||0));
  const observed=observations.filter(o=>o.provider===id);
  const evidenceFor=(model,kind)=>observed.find(o=>o.model===model&&o.capability===kind);
  const capabilities=['chat','image','audio'].map(kind=>{
   const models=status.modelCatalog?.[kind]?.[id]||[];
   let executable=kind==='chat'?!!status.providers[id]:kind==='image'?!!status.features?.[id+'Images']:
    id==='groq'?!!status.features?.groqAudio:id==='cloudflare'?!!status.features?.cloudflareAudio:false;
   return {kind:kind==='audio'?'transcription':kind,executable,models:models.map(m=>({id:m.id,specialty:m.specialty||null,
    contextTokens:m.context_window??null,maxOutputTokens:m.max_output_tokens??null,
    tested:Number(evidenceFor(m.id,kind==='audio'?'transcription':kind)?.successes||0)>0,
    evidence:evidenceFor(m.id,kind==='audio'?'transcription':kind)?{type:'upstream-api',artifactVerified:false,...evidenceFor(m.id,kind==='audio'?'transcription':kind)}:null,
    cost:m.pricing??null}))};
  });
  if(id==='pollinations'&&status.features?.pollinationsAudio)capabilities.push({kind:'speech',executable:true,models:[{id:'openai/tts-1',tested:Number(evidenceFor('openai/tts-1','speech')?.successes||0)>0}]});
  return {id,configured:!!status.configured?.[id],available:!!status.providers[id],
   authentication:health.state==='missing'?'missing':lastSuccess||observed.some(o=>o.successes>0)?'previous-success':'unverified',
   state:health.state||'unknown',quotas:status.usage?.[id]||null,retryAt:health.retryAt||null,
   recentError:health.state&&health.state!=='configured'?health.state:null,
   lastSuccessAt:Math.max(lastSuccess,...observed.map(o=>Number(o.last_success_at)||0))||null,
   latencyMs:observed.reduce((n,o)=>n+Number(o.samples||0),0)?observed.reduce((n,o)=>n+Number(o.duration_ms||0),0)/observed.reduce((n,o)=>n+Number(o.samples||0),0):null,
   costUsd:null,capabilities,
   restrictions:['existing-rate-limits','circuit-breakers','credential-pools','manual-preference']};
 });
}
export async function getQueenProviders(env){
 const response=await providerStatus({env});
 if(!response.ok)throw Error('PROVIDER_REGISTRY_UNAVAILABLE');
 const status=await response.json();
 const observations=await readQueenProviderObservations(env);
 return buildQueenProviderRegistry(status,{},observations);
}
export function selectQueenDelegate(providers,{kind='chat',manual=null,task='general'}={}){
 const eligible=providers.filter(p=>p.capabilities.some(c=>c.kind===kind&&c.executable)&&
  (kind!=='chat'||p.available));
 if(manual?.mode==='manual'&&kind==='chat'){
  const p=eligible.find(p=>p.id===manual.provider&&p.capabilities.some(c=>c.kind===kind&&c.models.some(m=>m.id===manual.model)));
  return p?{provider:p.id,model:manual.model}:null;
 }
 if(!eligible.length)return null;
 const usage=Object.fromEntries(eligible.map(p=>[p.id,p.quotas]));
 const ordered=rankProviders({task,baseOrder:eligible.map(p=>p.id),available:id=>eligible.some(p=>p.id===id),usage});
 const selected=eligible.find(p=>p.id===ordered[0])||eligible[0];
 const catalog=selected.capabilities.find(c=>c.kind===kind).models;
 const model=kind==='chat'?selectTaskModel(selected.id,task,'balanced',catalog):catalog[0]?.id;
 return model?{provider:selected.id,model,capability:kind,allowFallback:true}:null;

}
