import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanResearchQuery,
  inferResearchSearchOptions,
  normalizeResearchResults,
  mergeResearchResults
} from '../functions/_lib/research-search.js';
import { checkResearchLimits } from '../functions/_lib/limits.js';
import { onRequestPost } from '../functions/api/research/search.js';

function mockResearchDb(){
  const counters=new Map();
  return {
    counters,
    prepare(sql){
      let values=[];
      const statement={
        bind(...args){values=args;return statement;},
        async first(){
          if(sql.includes('SELECT request_count FROM ai_rate_limits WHERE scope=? AND window_start=?')){
            const [scope,start]=values;
            return {request_count:counters.get(scope+':'+start)||0};
          }
          if(sql.includes('INSERT INTO ai_rate_limits(scope,window_start,request_count)')){
            const [scope,start,max]=values;
            const key=scope+':'+start,current=counters.get(key)||0;
            if(current>=max)return null;
            counters.set(key,current+1);
            return {request_count:current+1};
          }
          return null;
        },
        async all(){return {results:[]};},
        async run(){return {success:true};}
      };
      return statement;
    }
  };
}

test('latest AI updates are routed as news with a recent time window',()=>{
  const query=cleanResearchQuery('Investiga en Internet las últimas novedades de inteligencia artificial.');
  assert.equal(query,'las últimas novedades de inteligencia artificial');
  assert.deepEqual(inferResearchSearchOptions(query),{
    topic:'news',timeRange:'week',jinaType:'news',searchDepth:'basic'
  });
});

test('deep research uses Tavily advanced search without changing ordinary query routing',()=>{
  assert.equal(inferResearchSearchOptions('Haz una investigación profunda sobre modelos de IA').searchDepth,'advanced');
  assert.equal(inferResearchSearchOptions('Cómo funciona una red neuronal').topic,'general');
});

test('Tavily and Jina results normalize publication dates and reject unsafe URLs',()=>{
  const results=normalizeResearchResults([
    {title:'Fuente Jina',url:'https://example.com/a',content:'x'.repeat(80),publishedTime:'2026-11-12'},
    {title:'URL insegura',url:'javascript:alert(1)',content:'x'.repeat(80)},
    {title:'Sin contenido',url:'https://example.org',content:''}
  ],'jina',8);
  assert.equal(results.length,1);
  assert.equal(results[0].published_date,'2026-11-12');
  assert.equal(results[0].provider,'jina');
});

test('research results merge and deduplicate the same canonical URL',()=>{
  const merged=mergeResearchResults([
    [{title:'Fuente',url:'https://example.com/story?utm_source=a',content:'breve'.repeat(12),provider:'tavily'}],
    [{title:'Fuente ampliada',url:'https://example.com/story#section',content:'contenido más completo '.repeat(20),published_date:'2026-11-12',provider:'jina'}]
  ]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].provider,'tavily+jina');
  assert.ok(merged[0].content.length>50);
  assert.equal(merged[0].published_date,'2026-11-12');
});

test('research rate limits are per visitor and separate from inference counters',async()=>{
  const db=mockResearchDb();
  const env={PRISMA_RATE_DB:db,PRISMA_VISITOR_DAILY_LIMIT:'40'};
  const firstIp=new Request('https://prismaspace.pages.dev/api/research/search',{
    method:'POST',headers:{'CF-Connecting-IP':'203.0.113.10'}
  });
  for(let i=0;i<20;i++)assert.equal(await checkResearchLimits(env,firstIp),null);
  const blocked=await checkResearchLimits(env,firstIp);
  assert.equal(blocked.status,429);
  assert.equal(blocked.scope,'research-ip-minute');
  const secondIp=new Request('https://prismaspace.pages.dev/api/research/search',{
    method:'POST',headers:{'CF-Connecting-IP':'203.0.113.11'}
  });
  assert.equal(await checkResearchLimits(env,secondIp),null);
  assert.equal([...db.counters.keys()].some(key=>key.startsWith('total-day:')),false);
});

test('Tavily results are enriched with Jina when the primary result set is thin',async()=>{
  const originalFetch=globalThis.fetch;
  let tavilyCalls=0,jinaCalls=0;
  globalThis.fetch=async(url,init={})=>{
    const target=String(url);
    if(target==='https://api.tavily.com/search'){
      tavilyCalls++;
      assert.equal(init.headers.Authorization,'Bearer tavily-secret');
      const body=JSON.parse(init.body);
      assert.equal(body.topic,'news');
      assert.equal(body.time_range,'week');
      return new Response(JSON.stringify({results:[
        {title:'Tavily uno',url:'https://tavily.example/one',content:'Resumen de una noticia con suficiente contexto para analizar.'},
        {title:'Tavily dos',url:'https://tavily.example/two',content:'Otro resumen de una noticia con suficiente contexto para analizar.'}
      ]}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(target.startsWith('https://s.jina.ai/')){
      jinaCalls++;
      assert.equal(init.headers.Authorization,'Bearer jina-secret');
      assert.equal(init.headers.Accept,'application/json');
      assert.ok(target.includes('type=news'));
      return new Response(JSON.stringify({code:200,status:20000,data:[
        {title:'Jina uno',url:'https://jina.example/one',content:'Texto completo de una publicación reciente con datos suficientes para contrastar.',publishedTime:'2026-11-12'},
        {title:'Jina dos',url:'https://jina.example/two',content:'Texto completo de otra publicación reciente con datos suficientes para contrastar.'},
        {title:'Jina tres',url:'https://jina.example/three',content:'Texto completo de una tercera publicación reciente con datos suficientes para contrastar.'}
      ]}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    throw new Error('Unexpected fetch target: '+target);
  };
  try{
    const request=new Request('https://prismaspace.pages.dev/api/research/search',{
      method:'POST',
      headers:{Origin:'https://prismaspace.pages.dev','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.12'},
      body:JSON.stringify({query:'Investiga en Internet las últimas novedades de inteligencia artificial.'})
    });
    const response=await onRequestPost({request,env:{TAVILY_API_KEY:'tavily-secret',JINA_API_KEY:'jina-secret',PRISMA_RATE_DB:mockResearchDb()}});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.ok,true);
    assert.deepEqual(data.providers,['tavily','jina']);
    assert.equal(data.results.length,5);
    assert.equal(tavilyCalls,1);
    assert.equal(jinaCalls,1);
    assert.equal(JSON.stringify(data).includes('tavily-secret'),false);
    assert.equal(JSON.stringify(data).includes('jina-secret'),false);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('a sufficient Tavily result set avoids an unnecessary Jina request',async()=>{
  const originalFetch=globalThis.fetch;
  let jinaCalls=0;
  globalThis.fetch=async(url,init={})=>{
    if(String(url)==='https://api.tavily.com/search'){
      return new Response(JSON.stringify({results:Array.from({length:5},(_,i)=>({
        title:'Tavily '+i,url:'https://tavily.example/'+i,content:'Contenido de investigación suficientemente largo para esta fuente número '+i+'.'
      }))}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(String(url).startsWith('https://s.jina.ai/'))jinaCalls++;
    throw new Error('Unexpected fetch target: '+String(url));
  };
  try{
    const request=new Request('https://prismaspace.pages.dev/api/research/search',{
      method:'POST',headers:{Origin:'https://prismaspace.pages.dev','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.13'},
      body:JSON.stringify({query:'Investiga sobre la evolución de la inteligencia artificial'})
    });
    const response=await onRequestPost({request,env:{TAVILY_API_KEY:'tavily-secret',JINA_API_KEY:'jina-secret',PRISMA_RATE_DB:mockResearchDb()}});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(data.providers,['tavily']);
    assert.equal(data.results.length,5);
    assert.equal(jinaCalls,0);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('research endpoint rejects requests without the same-origin header',async()=>{
  const request=new Request('https://prismaspace.pages.dev/api/research/search',{
    method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},
    body:JSON.stringify({query:'Investiga sobre IA'})
  });
  const response=await onRequestPost({request,env:{}});
  assert.equal(response.status,403);
});
