import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitResearchRequest, formatResearchSources } from '../src/core-research.js';

test('web research is activated only by explicit research/search wording',()=>{
  for(const query of [
    'Investiga las últimas investigaciones sobre caries dental',
    'Busca en internet las novedades de inteligencia artificial',
    'Consulta internet sobre los precios actuales de portátiles',
    'Necesito información actualizada sobre la normativa',
    'Haz una investigación profunda sobre energías renovables'
  ]) assert.equal(isExplicitResearchRequest(query),true,query);
  for(const query of [
    'Hola, ¿cómo estás?',
    '¿Qué es la inteligencia artificial?',
    'Resume este texto',
    'Convierte este PDF a Word',
    'Dame una explicación de Tavily'
  ]) assert.equal(isExplicitResearchRequest(query),false,query);
});

test('research sources keep only valid HTTP(S) URLs and bound external text',()=>{
  const sources=formatResearchSources([
    {title:'Fuente válida',url:'https://example.com/article',content:'Contenido',published_date:'2026-11-12'},
    {title:'URL inválida',url:'javascript:alert(1)',content:'No debe pasar'},
    {title:'Contenido extenso',url:'https://example.org',content:'x'.repeat(3000)}
  ]);
  assert.equal(sources.length,2);
  assert.equal(sources[0].url,'https://example.com/article');
  assert.equal(sources[1].content.length,2200);
});
