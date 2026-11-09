// Cost-aware, task-aware provider and model routing for Prisma Core.
// Routing is sequential: one model is used on the healthy path; alternatives
// are contacted only after a real failure. OpenRouter remains the final reserve.
export const ROUTE_ORDER = Object.freeze({
  planner: ["groq","cloudflare","gemini","pollinations","huggingface","openrouter"],
  quick: ["groq","cloudflare","gemini","pollinations","huggingface","openrouter"],
  conversation: ["groq","cloudflare","gemini","pollinations","huggingface","openrouter"],
  general: ["groq","cloudflare","gemini","pollinations","huggingface","openrouter"],
  summary: ["cloudflare","groq","gemini","pollinations","huggingface","openrouter"],
  coding: ["cloudflare","groq","gemini","pollinations","huggingface","openrouter"],
  reasoning: ["gemini","cloudflare","groq","pollinations","huggingface","openrouter"],
  creative: ["groq","gemini","cloudflare","pollinations","huggingface","openrouter"],
  songwriting: ["groq","gemini","cloudflare","pollinations","huggingface","openrouter"],
});

const MODEL_BY_TASK = Object.freeze({
  planner: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/deepseek-ai/deepseek-v4.1-flash-1017"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"deepseek/deepseek-v4-flash"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  quick: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-20b"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/google/gemma-4-26b-a4b-it"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"openai/gpt-oss-20b:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  summary: {
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-20b:cheapest",smart:"openai/gpt-oss-120b:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  coding: {
    cloudflare: {fast:"@cf/qwen/qwen3.8-27b",balanced:"@cf/qwen/qwen3.8-27b",smart:"@cf/qwen/qwen3.8-27b"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    pollinations: {fast:"qwen/qwen3-coder-30b-a3b-instruct",balanced:"qwen/qwen3-coder-30b-a3b-instruct",smart:"qwen/qwen3-coder-30b-a3b-instruct"},
    huggingface: {fast:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",balanced:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest",smart:"Qwen/Qwen2.5-Coder-32B-Instruct:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  reasoning: {
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/deepseek-ai/deepseek-v4.1-flash-1017",smart:"@cf/deepseek-ai/deepseek-v4.1-flash-1017"},
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"deepseek/deepseek-v4-flash",smart:"deepseek/deepseek-v4-flash"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"deepseek-ai/DeepSeek-R1:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  creative: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
  songwriting: {
    groq: {fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-120b",smart:"openai/gpt-oss-120b"},
    gemini: {fast:"gemini-3.5-flash-lite",balanced:"gemini-3.8-flash",smart:"gemini-3.8-flash"},
    cloudflare: {fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
    pollinations: {fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
    huggingface: {fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
    openrouter: {fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
  },
});
const DEFAULT_MODELS = {
  groq:{fast:"openai/gpt-oss-20b",balanced:"openai/gpt-oss-20b",smart:"openai/gpt-oss-120b"},
  cloudflare:{fast:"@cf/google/gemma-4-26b-a4b-it",balanced:"@cf/google/gemma-4-26b-a4b-it",smart:"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},
  gemini:{fast:"gemini-3.5-flash-lite",balanced:"gemini-3.5-flash-lite",smart:"gemini-3.8-flash"},
  pollinations:{fast:"openai/gpt-5.4-nano",balanced:"openai/gpt-5.4-nano",smart:"openai/gpt-5.4-nano"},
  huggingface:{fast:"openai/gpt-oss-20b:cheapest",balanced:"openai/gpt-oss-120b:cheapest",smart:"deepseek-ai/DeepSeek-R1:cheapest"},
  openrouter:{fast:"openrouter/free",balanced:"openrouter/free",smart:"openrouter/free"},
};

export function rankProviders({preferred="auto",task="general",baseOrder=ROUTE_ORDER[task]||ROUTE_ORDER.general,available=()=>true,health={},now=Date.now()}={}) {
  const order=[...new Set(preferred==="auto"?baseOrder:[preferred,...baseOrder.filter(name=>name!==preferred)])]
    .filter(name=>available(name));
  if(preferred!=="auto")return order;
  return order.map((name,index)=>{
    const record=health[name+":"+task]||{};
    const recent=now-Number(record.at||0)<15*60*1000;
    const cooling=recent&&Number(record.coolingUntil||0)>now;
    const failures=recent?Math.min(4,Number(record.failures||0)):0;
    const latency=recent&&Number(record.averageMs||0)>0?Math.min(3,Number(record.averageMs)/10000):0;
    // A cooling primary must yield to the independent OpenRouter reserve until its retry window expires.
    return {name,score:index*10+(cooling?2500:0)+failures*3+latency+(name==='openrouter'?1000:0)};
  }).sort((a,b)=>a.score-b.score).map(item=>item.name);
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
