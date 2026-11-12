import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import translations from '../src/locales/en.js';
import { tools, categories } from '../src/registry.js';
import { normalizeIntent, extractPayload, isInformationalIntent } from '../src/core-capabilities.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const source=JSON.parse(await read('src/locales/ui-source.es.json'));

const nonUiSourceFragments=new Set([
  ":\n   /\\b(guia de estudio|apuntes|cuestionario|tarjetas de estudio)\\b/i.test(taskText)?",
  ".  Solicitud del usuario:",
  ".' ,\n    'pdf-remove-pages':'Usa params.pages con las páginas que se eliminarán, por ejemplo",
  "))\n   throw Error(",
  "))throw Error(",
  "&&/\\b(compara|comparacion|comparativa|versus|pros y contras|que conviene|cual conviene|mejor opcion|ventajas y desventajas)\\b/.test(normalizedTask)?",
  "&&/\\b(plan de accion|planifica|planea|organiza|paso a paso|cronograma|hoja de ruta|roadmap|prioriza)\\b/.test(normalizedTask)?",
  "&&/\\b(revisa|revisar|revision|corrige|critica|contradicciones|coherencia|mejora este texto)\\b/.test(normalizedTask)?",
  "Resume fielmente esta transcripción. Incluye ideas esenciales y acciones mencionadas. No inventes hechos.\\ \\"
]);

const placeholders=value=>[...String(value).matchAll(/\{[A-Za-z0-9_.-]+\}|%[sdif]|:[A-Za-z][A-Za-z0-9_]*/g)].map(match=>match[0]).sort();
const looksSpanish=value=>/[áéíóúñ¿¡]/i.test(value)||
  /\b(?:para|con|sin|herramienta|archivo|imagen|páginas|herramientas|disponible|selecciona|adjunta|elimina|guardar|iniciar|sesión|cuenta|configuración|cancelar|siguiente|anterior|revisa|también|puede|necesita|utiliza|procesar|descargar|subir|abrir|cerrar|enviar|recibir|texto|datos|contenido|documento|formato|calidad|resultado|crear|extraer|comprimir|dividir|unir|convertir|categoría|diseño|desarrollo|utilidades|imágenes|personalizable|instantáneo|modelo|mediante|permite|conserva|entrega|primera|vez|funciona|genera|procesa|preparar|seleccionar|cambiar|exportar|importar|organizar|estudio|investigación|creación|privacidad|archivos|cálculo|hojas|redimensionar|girar|rotar|composición|mejora)\b/i.test(value);

test('English dictionary covers every extracted user-facing source string',()=>{
 const missing=source.strings.filter(value=>!(value in translations)&&!nonUiSourceFragments.has(value));
 assert.deepEqual(missing,[]);
});

test('English translations preserve all interpolation placeholders',()=>{
 const mismatches=source.strings.filter(value=>value in translations&&
  JSON.stringify(placeholders(value))!==JSON.stringify(placeholders(translations[value])));
 assert.deepEqual(mismatches,[]);
});

test('all Spanish registry names, categories and descriptions have English equivalents',()=>{
 const labels=[...categories.map(item=>item.name),...tools.flatMap(item=>[item.name,item.description])];
 const missing=[...new Set(labels.filter(value=>looksSpanish(value)&&!(value in translations)))];
 assert.deepEqual(missing,[]);
});

test('English requests are normalized without losing negative instructions or confusing questions with actions',()=>{
 assert.match(normalizeIntent('Please remove the image background'),/quitar fondo/);
 assert.match(normalizeIntent("Do not remove the background"),/no quites fondo/);
 assert.equal(isInformationalIntent('Can you compress this PDF?'),false);
 assert.equal(isInformationalIntent('How can I compress a PDF?'),true);
 assert.equal(isInformationalIntent('How many words are in text: Prisma Space is a workspace'),false);
 const payload=extractPayload('Count words in text: Prisma Space is a workspace');
 assert.equal(payload.text,'Prisma Space is a workspace');
});

test('English language selection respects explicit routes, saved preferences and regional Spanish browsers',async()=>{
 const i18n=await read('src/i18n.js');
 assert.match(i18n,/preferredBrowserLanguage = String\(browserLanguages\[0\]/);
 assert.match(i18n,/const routeLanguage = \/\^\\\/en/);
 assert.match(i18n,/const initialLanguage = routeLanguage \|\| savedLanguage \|\|/);
 assert.match(i18n,/browserSpanish \? 'es' : 'en'/);
 assert.match(i18n,/location\.pathname === '\/' && initialLanguage === 'en'/);
 assert.match(i18n,/const target = next === 'en' \? '\/en\/' : '\/'/);
});

test('Core and model prompts produce English responses when English is selected',async()=>{
 const core=await read('src/core.js');
 const engines=await read('src/engines.js');
 assert.match(core,/Output language: English/);
 assert.match(core,/window\.prismaI18n\?\.language==='en'/);
 assert.match(engines,/responseLanguage=typeof window!=='undefined'&&window\.prismaI18n\?\.language==='en'\?'English':'Spanish'/);
 assert.match(engines,/const tones=responseLanguage==='English'\?/);
 assert.doesNotMatch(engines,/const tones=responseLanguage==='en'\?/);
 assert.match(engines,/This is an original songwriting task/);
});
