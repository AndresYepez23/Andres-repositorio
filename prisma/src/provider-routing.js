// Cost-aware, task-aware provider and model routing for Prisma Core.
// Routing is sequential: one model is used on the healthy path; alternatives
// are contacted only after a real failure. OpenRouter remains the final reserve.
export const ROUTE_ORDER = Object.freeze({
  planner: ["groq","cloudflare","sensenova","zai","gemini","requesty","pollinations","huggingface","kilo","aihubmix","openrouter"],
  quick: ["groq","cloudflare","requesty","sensenova","zai","gemini","pollinations","huggingface","kilo","aihubmix","openrouter"],
  conversation: ["groq","cloudflare","gemini","sensenova","zai","requesty","pollinations","huggingface","kilo","aihubmix","openrouter"],
  general: ["groq","cloudflare","gemini","sensenova","zai","requesty","pollinations","huggingface","kilo","aihubmix","openrouter"],
  summary: ["cloudflare","groq","gemini","requesty","sensenova","zai","pollinations","huggingface","kilo","aihubmix","openrouter"],
  coding: ["cloudflare","groq","zai","requesty","sensenova","gemini","pollinations","huggingface","kilo","aihubmix","openrouter"],
  reasoning: ["gemini","sensenova","zai","requesty","cloudflare","groq","pollinations","huggingface","kilo","aihubmix","openrouter"],
  creative: ["groq","gemini","sensenova","zai","requesty","cloudflare","pollinations","huggingface","kilo","aihubmix","openrouter"],
  songwriting: ["groq","gemini","sensenova","zai","requesty","cloudflare","pollinations","huggingface","kilo","aihubmix","openrouter"],
});

const MODEL_BY_TASK = Object.freeze({
  planner: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/deepseek-ai/deepseek-v4.1-flash-1017"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"deepseek/deepseek-v4-flash"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  quick: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-20b"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/google/gemma-4-26b-a4b-it"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"openai/gpt-oss-20b:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  summary: {
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"openai/gpt-oss-120b:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  coding: {
    cloudflare: {fast:"@cf/qwen/qwen3.8-27b",balanced:"@cf/qwen/qwen3.8-27b",smart:"@cf/qwen/qwen3.8-27b"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    pollinations: {fast:"qwen/qwen3-coder-30b-a3b-instruct",balanced:"qwen/qwen3-coder-30b-a3b-instruct",smart:"qwen/qwen3-coder-30b-a3b-instruct"},
    huggingface: {fast:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",balanced:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",smart:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  reasoning: {
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/deepseek-ai/deepseek-v4.1-flash-1017",smart:"@cf/deepseek-ai/deepseek-v4.1-flash-1017"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"deepseek/deepseek-v4-flash",smart:"deepseek/deepseek-v4-flash"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"deepseek-ai/DeepSeek-R1:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  creative: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
  songwriting: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
    sensenova: {fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
    zai: {fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
    requesty: {fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
    kilo: {fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  },
});
const DEFAULT_MODELS = {
  groq:{fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
  cloudflare:{fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
  gemini:{fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
  pollinations:{fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
  huggingface:{fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
  openrouter:{fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  sensenova:{fast:"sensenova-6.8-flash-lite",balanced:"sensenova-6.8-flash-lite",smart:"sensenova-6.8-flash-lite"},
  zai:{fast:"glm-4.5-flash",balanced:"glm-4.7-flash",smart:"glm-4.7-flash"},
  requesty:{fast:"novita/inclusionai/ling-3.0-tiny",balanced:"novita/ling-3.1-flash",smart:"novita/ling-3.1-flash"},
  kilo:{fast:"z-ai/glm-5:free",balanced:"minimax/minimax-m2.1:free",smart:"z-ai/glm-5:free"},
  aihubmix:{fast:"coding-glm-5.3-flash-free",balanced:"coding-glm-5.3-free",smart:"coding-kimi-k3-free"},
};

export function rankProviders({preferred="auto",task="general",baseOrder=ROUTE_ORDER[task]||ROUTE_ORDER.general,available=()=>true,health={},usage={},now=Date.now()}={}) {
  const order=[...new Set(preferred==="auto"?baseOrder:[preferred,...baseOrder.filter(name=>name!==preferred)])].filter(name=>available(name));
  if(preferred!=="auto")return order;
  return order.map((name,index)=>{
    const record=health[name+":"+task]||{},recent=now-Number(record.at||0)<30*60*1000;
    const cooling=recent&&Number(record.coolingUntil||0)>now;
    const failures=recent?Math.min(4,Math.max(0,Number(record.failures)||0)):0;
    const successes=recent?Math.min(4,Math.max(0,Number(record.successes)||0)):0;
    const averageMs=recent?Math.max(0,Number(record.averageMs)||0):0;
    const latency=averageMs?Math.min(18,averageMs/1800):0;
    const reliability=failures*6-Math.min(2,successes*0.5);
    const daily=usage[name]?.daily||usage[name]||{};
    const used=Math.max(0,Number(daily.used)||0),limit=Math.max(0,Number(daily.limit)||0);
    // Weighted fair queueing: route order expresses task fit and provider priority;
    // shared daily use plus this session's recent successes prevent one healthy
    // provider from monopolizing every request while others stay idle.
    const utilization=limit>0?Math.max(0,Math.min(1,used/limit)):0;
    const priorityWeight=1/(1+index*0.35);
    const loadPenalty=(used+successes*2)/priorityWeight;
    const quotaPenalty=utilization*12;
    return {name,score:loadPenalty+quotaPenalty+latency+reliability+index*0.05+(cooling?1000:0)+(name==='openrouter'?10000:0)};
  }).sort((a,b)=>a.score-b.score).map(item=>item.name);
}

export function adaptiveProviderDeadline({averageMs=0,baseMs=21000,minMs=12000,multiplier=2.5,overheadMs=3000}={}) {
  const base=Number.isFinite(Number(baseMs))?Math.max(1000,Number(baseMs)):21000;
  const minimum=Number.isFinite(Number(minMs))?Math.max(1000,Math.min(base,Number(minMs))):Math.min(base,12000);
  const observed=Math.max(0,Number(averageMs)||0);
  if(!observed)return base;
  return Math.max(minimum,Math.min(base,Math.round(observed*multiplier+overheadMs)));
}

// SenseNova 6.8 Flash Lite is a reasoning preview model: its first useful
// answer can take longer than a normal 5-10s fallback slice. Give it a viable
// deadline without spending the independent backup's reserved time.
export function sensenovaRequestDeadline({remainingMs,automatic=true,task="general",hasOpenRouterBackup=false}={}) {
  const remaining=Math.max(0,Number(remainingMs)||0);
  const reserve=automatic&&hasOpenRouterBackup?14000:0;
  const usable=remaining-reserve-1500;
  if(usable<(automatic?12000:8000))return null;
  const target=automatic?(task==="reasoning"||task==="planner"?22000:16000):45000;
  return Math.max(0,Math.min(target,usable));
}

export function selectTaskModel(provider,task="general",tier="balanced",catalog=[]) {
  const selectedTier=["fast","balanced","smart"].includes(tier)?tier:"balanced";
  const desired=(MODEL_BY_TASK[task]?.[provider]||DEFAULT_MODELS[provider]||{})[selectedTier]||"";
  if(!Array.isArray(catalog)||!catalog.length)return desired;
  return catalog.some(item=>item.id===desired)?desired:(catalog[0]?.id||desired);
}

export function providerRouteDescription(task="general") {
  const route=ROUTE_ORDER[task]||ROUTE_ORDER.general;
  return route.slice();
}
