import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToolFields} from '../src/tool-fields.js';
import {runTool} from '../src/engines.js';
import {tools} from '../src/registry.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const {pages}=JSON.parse(read('../seo/pages.json'));
const audit=JSON.parse(read('../seo/audit.json'));
const main=read('../src/main.js');
const build=t=>renderToolFields(t,{
 field:(label,name)=>'<input name="'+name+'">',textareaField:(label,name)=>'<textarea name="'+name+'"></textarea>',
 selectField:(label,name,options)=>'<select name="'+name+'">'+options.map(([v])=>'<option value="'+v+'">').join('')+'</select>',
 textStudioModelSettings:()=>'',pollinationsAuthFields:()=>''
});
test('the entire registry is accounted for with no undocumented omissions',()=>{
 assert.deepEqual(audit.inventory.map(t=>t.tool),tools.map(t=>t.id));
 for(const t of audit.inventory){assert.ok(t.reason);assert.deepEqual(t.pages,pages.filter(p=>p.tool===t.tool).map(p=>p.slug));}
});
test('new landing tools expose actual input fields and format selectors',()=>{
 for(const p of pages.slice(40)){
  const t=tools.find(t=>t.id===p.tool),html=build(t);
  if(!t.file&&t.id!=='color-palette')assert.match(html,/<(?:input|textarea|select)\b/,t.id+' missing form');
  if(p.format)assert.ok(html.includes('value="'+p.format+'"'),t.id+' missing format');
 }
});
test('local advertised operations produce expected outputs through the real dispatcher',async()=>{
 const cases=[
 ['base64',{text:'Prisma ñ',mode:'encode'},'UHJpc21hIMOx'],
 ['base64',{text:'UHJpc21hIMOx',mode:'decode'},'Prisma ñ'],
 ['url-code',{text:'café uno',mode:'encode'},'caf%C3%A9%20uno'],
 ['text-remove-accents',{text:'mañana café'},'manana cafe'],
 ['text-reverse',{text:'uno\ndos',mode:'lines'},'dos\nuno'],
 ['text-remove-empty-lines',{text:'a\n  \nb'},'a\nb'],
 ['text-prefix-lines',{text:'a\nb',prefix:'[',suffix:']'},'[a]\n[b]'],
 ['text-replace',{text:'Prisma prisma',search:'prisma',replacement:'P'},'P P'],
 ['text-extract-emails',{text:'a@b.com a@b.com'},'a@b.com'],
 ['text-extract-urls',{text:'Mira https://example.com.'},'https://example.com'],
 ['text-extract-hashtags',{text:'#Prisma #prisma'},'#Prisma'],
 ['text-extract-phones',{text:'Tel: +57 300 123 4567'},'+57 300 123 4567'],
 ['json-minify',{text:'{ "a": 1 }'},'{"a":1}'],
 ['json-flatten',{text:'{"user":{"id":1}}'},'user.id = 1'],
 ['text-case',{text:'Hola',mode:'lower'},'hola'],
 ['csv-json',{text:'name,city\nAna,Chinu'},'[\n  {\n    "name": "Ana",\n    "city": "Chinu"\n  }\n]'],
 ['json-csv',{text:'[{"name":"Ana"}]'},'name\nAna'],
 ['slug',{text:'Mi página nueva'},'mi-pagina-nueva'],
 ['dedupe-lines',{text:'Ana\nana\nLuis'},'Ana\nLuis'],
 ['clean-text',{text:'  hola   mundo  '},'hola mundo'],
 ['html-entities',{text:'<b>',mode:'encode'},'&lt;b&gt;'],
 ['calculator',{expression:'(125 * 1.19) + 5000'},'5148.75'],
 ['percentage',{a:100,b:120,mode:'change'},'20.00 %'],
 ['date-diff',{start:'2026-01-01',end:'2026-01-03'},'2 días'],
 ['units',{kind:'length',value:1,from:'m',to:'cm'},'1 m = 100 cm'],
 ['contrast',{foreground:'#000',background:'#fff'},'21.00:1'],
 ['text-sort',{text:'B\nA'},'A\nB'],
 ['json-compare-local',{textA:'{"a":1}',textB:'{"a":1}'},'Los dos documentos JSON son equivalentes.'],
 ['utm-builder',{url:'https://example.com/',source:'instagram',medium:'social',campaign:'demo'},'https://example.com/?utm_source=instagram&utm_medium=social&utm_campaign=demo']
 ];
 for(const [id,params,expected] of cases)assert.equal((await runTool(id,[],params)).text,expected,id);
});
test('previously excluded multiline and formatter issues remain repaired',async()=>{
 assert.equal((await runTool('json-format',[],{text:'{"a":1}',indent:'2'})).text,'{\n  "a": 1\n}');
 const cards=await runTool('flashcards-export',[],{text:'A | Uno\nB | Dos'});
 assert.match(cards.summary,/2 tarjetas/);
});
