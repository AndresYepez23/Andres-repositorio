import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, tavilyKeys } from '../functions/api/research/search.js';

const originalFetch = globalThis.fetch;
const request = query => new Request('https://prismaspace.pages.dev/api/research/search', {
  method: 'POST',
  headers: { Origin: 'https://prismaspace.pages.dev', 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
});

test('Tavily is preferred and returns normalized cited sources', async t => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /api\.tavily\.com\/search/);
    assert.equal(JSON.parse(init.body).search_depth, 'advanced');
    return Response.json({ results: [{ title: 'AI update', url: 'https://example.com/ai', content: 'Verified result', published_date: '2026-11-12' }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({ request: request('latest AI news'), env: { TAVILY_API_KEY: 'tavily-test', JINA_API_KEY: 'jina-test' } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'tavily');
  assert.equal(data.results[0].url, 'https://example.com/ai');
  assert.equal(data.fallbackUsed, false);
});

test('Jina is used when Tavily is unavailable and returns markdown SERP sources', async t => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (String(url).includes('tavily.com')) return Response.json({ error: 'quota' }, { status: 429 });
    assert.match(String(url), /s\.jina\.ai/);
    assert.equal(init.headers['X-Return-Format'], 'markdown');
    return Response.json({ code: 200, data: '# Research update\n\nhttps://example.org/research\n\nA useful source with details.' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({ request: request('latest AI research'), env: { TAVILY_API_KEY: 'tavily-test', JINA_API_KEY: 'jina-test' } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'jina');
  assert.equal(data.fallbackUsed, true);
  assert.equal(data.results[0].url, 'https://example.org/research');
  assert.equal(calls, 2, 'A Tavily quota response must not rotate through other Tavily keys');
});

test('Tavily rotates credentials only after key authentication failures', async t => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    if (init.headers.Authorization === 'Bearer invalid') return Response.json({ error: 'invalid key' }, { status: 401 });
    return Response.json({ results: [{ title: 'Recovered', url: 'https://example.net', content: 'Recovered with second key' }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({ request: request('current AI models'), env: {
    TAVILY_API_KEY: 'invalid', TAVILY_API_KEY_2: 'valid', JINA_API_KEY: 'jina-test'
  } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'tavily');
  assert.equal(calls, 2);
});

test('research rejects cross-origin requests and missing search credentials', async () => {
  const blocked = await onRequestPost({ request: new Request('https://prismaspace.pages.dev/api/research/search', {
    method: 'POST', headers: { Origin: 'https://attacker.example' }, body: JSON.stringify({ query: 'latest AI news' })
  }), env: {} });
  assert.equal(blocked.status, 403);
  const missing = await onRequestPost({ request: request('latest AI news'), env: {} });
  assert.equal(missing.status, 502);
});

test('Tavily credentials can be consolidated into one encrypted JSON binding', () => {
  const pool=Array.from({length:7},(_,i)=>'tavily-credential-'+(i+1));
  assert.deepEqual(tavilyKeys({TAVILY_API_KEYS_JSON:JSON.stringify(pool)}),pool);
  assert.deepEqual(tavilyKeys({TAVILY_API_KEYS_JSON:JSON.stringify(pool),TAVILY_API_KEY:'replaced-primary'}),['replaced-primary',...pool.slice(1)]);
  assert.deepEqual(tavilyKeys({TAVILY_API_KEYS_JSON:'invalid',TAVILY_API_KEY:'single-key'}),['single-key']);
});

test('Jina can be tested independently without calling Tavily', async t => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /s\\.jina\\.ai/);
    assert.equal(init.headers.Authorization, 'Bearer jina-test');
    return Response.json({ code: 200, data: [{ title: 'Jina source', url: 'https://example.org/jina', content: 'Jina diagnostic result' }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({ request: new Request('https://prismaspace.pages.dev/api/research/search', {
    method: 'POST', headers: { Origin: 'https://prismaspace.pages.dev', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test Jina search provider', provider: 'jina' })
  }), env: { TAVILY_API_KEY: 'tavily-test', JINA_API_KEY: 'jina-test' } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.provider, 'jina');
  assert.equal(data.diagnostic, true);
  assert.equal(calls, 1, 'A direct Jina test must not call Tavily');
});

test('Tavily can be tested independently without silently falling back to Jina', async t => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    assert.match(String(url), /api\\.tavily\\.com/);
    return Response.json({ error: 'quota' }, { status: 429 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestPost({ request: new Request('https://prismaspace.pages.dev/api/research/search', {
    method: 'POST', headers: { Origin: 'https://prismaspace.pages.dev', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test Tavily search provider', provider: 'tavily' })
  }), env: { TAVILY_API_KEY: 'tavily-test', JINA_API_KEY: 'jina-test' } });
  const data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.provider, 'tavily');
  assert.equal(data.diagnostics.tavily.status, 429);
  assert.equal(calls, 1, 'A direct Tavily test must not call Jina');
});
