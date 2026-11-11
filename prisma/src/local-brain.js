// Prisma Mini: optional local semantic router. No hosted inference endpoint or API key.
// The ONNX weights are downloaded once into the browser cache when the visitor opts in.
// This small embedding model ranks tools; it does NOT generate conversational text.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
let modelPromise = null;
const cachedVectorsByModel = new WeakMap();
const MAX_CACHED_TOOL_VECTORS = 256; // ~1MB at 384 dimensions; memory only.


export async function loadLocalBrain(onProgress = () => {}) {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { pipeline } = await import(TRANSFORMERS_CDN);
      return pipeline("feature-extraction", MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        progress_callback: event => {
          if(event?.status === "progress" && Number.isFinite(event.progress)) onProgress(Math.round(event.progress));
        },
      });
    })().catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

function normalize(value) {
  return String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function lexicalScore(query, label) {
  const tokens = new Set(normalize(query).split(" ").filter(x => x.length > 3));
  if(!tokens.size) return 0;
  const normalizedLabel = normalize(label);
  let hits=0;
  for(const token of tokens) {
    if(normalizedLabel.includes(token)) hits++;
    else if(token.length>5 && normalizedLabel.includes(token.slice(0,-2))) hits+=0.45;
  }
  return Math.min(1,hits/tokens.size);
}

// Each conversation previously embedded all 32 tool descriptions again.
// Cache *only catalog descriptions*, never user prompts or file content.
// The query still gets a fresh semantic embedding every time.
export async function rankLocalTools(query,catalog,limit=28,{model:providedModel}={}) {
  if(!Array.isArray(catalog)||!catalog.length)return [];
  const model=providedModel||await loadLocalBrain();
  if(typeof model!=='function')throw Error('Prisma Mini no dispone de un motor semántico utilizable.');
  const shortlist=catalog.slice(0,Math.min(32,catalog.length));
  let cache=cachedVectorsByModel.get(model);
  if(!cache){cache=new Map();cachedVectorsByModel.set(model,cache);}
  const labels=shortlist.map(item=>
    ((item.name||"")+" · "+(item.description||"")+" · "+(item.hint||"")).slice(0,235)
  );
  const unseen=[...new Set(labels.filter(label=>!cache.has(label)))];
  const output=await model([String(query||"").slice(0,500),...unseen],{
    pooling:"mean",normalize:true
  });
  const vectors=await output.tolist();
  if(!Array.isArray(vectors)||vectors.length!==1+unseen.length)
    throw Error('Prisma Mini devolvió vectores semánticos incompletos.');
  const queryVector=vectors[0];
  if(!Array.isArray(queryVector)||!queryVector.length)
    throw Error('Prisma Mini no pudo representar la solicitud.');
  unseen.forEach((label,i)=>{
    if(cache.size>=MAX_CACHED_TOOL_VECTORS)cache.delete(cache.keys().next().value);
    cache.set(label,vectors[i+1]);
  });
  return shortlist.map((item,i)=>{
    const target=cache.get(labels[i])||[];
    let semantic=0;
    for(let j=0;j<Math.min(queryVector.length,target.length);j++)
      semantic+=queryVector[j]*target[j];
    const lexical=lexicalScore(query,labels[i]);
    return {...item,miniScore:Math.max(-1,Math.min(1,semantic))*.7+lexical*.3,miniOriginalIndex:i};
  }).sort((a,b)=>b.miniScore-a.miniScore||a.miniOriginalIndex-b.miniOriginalIndex)
    .slice(0,limit);
}
