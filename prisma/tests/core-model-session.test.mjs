import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_SESSION_IDLE_MS,
  beginConversationModelTurn,
  normalizeConversationModelSelection,
  selectManualConversationModel,
  selectAutomaticConversationModel,
  pinConversationModel,
  conversationModelRequest
} from '../src/core-model-session.js';
import {
  buildConversationContext,
  isCoreFollowUp,
  isCoreNewTask,
  chooseCoreContextOptions
} from '../src/core-context.js';

test('automatic chats pin the first successful model and keep it for the conversation',()=>{
  let selection=beginConversationModelTurn({mode:'auto'},1000);
  selection=pinConversationModel(selection,{provider:'groq',model:'openai/gpt-oss-20b'},1200);
  assert.equal(selection.provider,'groq');
  assert.equal(selection.model,'openai/gpt-oss-20b');
  assert.equal(selection.usedAt,1200);
  const next=beginConversationModelTurn(selection,5000);
  assert.equal(next.provider,'groq');
  assert.equal(conversationModelRequest(next).provider,'groq');
  assert.equal(conversationModelRequest(next).allowFallback,true);
});

test('automatic model pin is refreshed after 30 minutes without a user message',()=>{
  let selection=beginConversationModelTurn({mode:'auto'},1000);
  selection=pinConversationModel(selection,{provider:'zai',model:'glm-4.5-flash'},1200);
  const refreshed=beginConversationModelTurn(selection,1000+MODEL_SESSION_IDLE_MS+1);
  assert.equal(refreshed.mode,'auto');
  assert.equal(refreshed.provider,'');
  assert.equal(refreshed.model,'');
  assert.equal(refreshed.usedAt,0);
  assert.equal(conversationModelRequest(refreshed).provider,'auto');
});

test('manual choice remains primary, fallback becomes sticky, and idle retries the manual preference',()=>{
  let selection=selectManualConversationModel({mode:'auto'},'zai','glm-4.5-flash',100);
  selection=beginConversationModelTurn(selection,200);
  selection=pinConversationModel(selection,{
    provider:'groq',model:'openai/gpt-oss-20b',fallbackFrom:'zai',fallbackReason:'Z.AI timeout'
  },300);
  assert.equal(selection.mode,'manual');
  assert.equal(selection.provider,'groq');
  assert.equal(selection.source,'fallback');
  assert.ok(selection.usedAt>0);
  assert.equal(selection.requestedProvider,'zai');
  assert.equal(selection.requestedModel,'glm-4.5-flash');
  assert.equal(beginConversationModelTurn(selection,400).provider,'groq');
  const retryManual=beginConversationModelTurn(selection,200+MODEL_SESSION_IDLE_MS+1);
  assert.equal(retryManual.provider,'zai');
  assert.equal(retryManual.model,'glm-4.5-flash');
  assert.equal(retryManual.source,'manual');
});

test('automatic mode clears a previous manual preference without changing other chat state',()=>{
  const manual=selectManualConversationModel({mode:'auto',lastUserAt:42},'gemini','gemini-3.5-flash-lite',100);
  const automatic=selectAutomaticConversationModel(manual,200);
  assert.equal(automatic.mode,'auto');
  assert.equal(automatic.provider,'');
  assert.equal(automatic.model,'');
  assert.equal(automatic.lastUserAt,42);
  assert.equal(normalizeConversationModelSelection(automatic).mode,'auto');
});

test('follow-up questions retain an older image exchange beyond the recent message window',()=>{
  const history=[
    {role:'user',content:'Analiza esta fotografía y dime qué observas.',files:['fotografia-clinica.png']},
    {role:'assistant',content:'En la fotografía se observa una zona central con cambios de color y un borde irregular. Esta descripción corresponde a la imagen que adjuntaste.'},
    ...Array.from({length:6},(_,i)=>[
      {role:'user',content:'Pregunta intermedia '+(i+1)+' sobre el tema.'},
      {role:'assistant',content:'Respuesta intermedia '+(i+1)+'.'}
    ]).flat()
  ];
  assert.equal(isCoreFollowUp('¿Y si le hago otra pregunta sobre eso?'),true);
  assert.equal(isCoreFollowUp('¿Qué tal si le hago otra pregunta?'),true);
  const context=buildConversationContext(history,'¿Y si le hago otra pregunta sobre eso?',{
    maxMessages:13,maxChars:14500
  });
  const combined=context.map(item=>item.content).join('\n');
  assert.match(combined,/fotografia-clinica\.png/);
  assert.match(combined,/borde irregular/);
  assert.ok(context.length<=13);
});

test('short follow-ups retain the original task and answer after many intervening turns',()=>{
  const history=[
    {role:'user',content:'Compara tres alternativas de financiación y recomiéndame una.'},
    {role:'assistant',content:'Alternativa 1: menor cuota. Alternativa 2: mejor plazo y coste total. Alternativa 3: mayor flexibilidad. Recomiendo la alternativa 2 por su equilibrio.'},
    ...Array.from({length:7},(_,i)=>[
      {role:'user',content:'Y también explícame el detalle número '+(i+1)+' de esa comparación.'},
      {role:'assistant',content:'Detalle adicional '+(i+1)+' relacionado con la comparación original.'}
    ]).flat()
  ];
  const query='¿Y la segunda opción?';
  assert.equal(isCoreFollowUp(query),true);
  const options=chooseCoreContextOptions('conversation',query);
  const context=buildConversationContext(history,query,options);
  const combined=context.map(item=>item.content).join('\\n');
  assert.match(combined,/Compara tres alternativas de financiación/);
  assert.match(combined,/mejor plazo y coste total/);
  assert.ok(context.length<=15);
});

test('explicit new tasks start with a clean context instead of importing an old photo',()=>{
  const history=[
    {role:'user',content:'Analiza esta fotografía.',files:['foto-anterior.jpg']},
    {role:'assistant',content:'La fotografía muestra una fachada azul.'},
    ...Array.from({length:6},(_,i)=>[
      {role:'user',content:'Seguimiento '+(i+1)},
      {role:'assistant',content:'Respuesta '+(i+1)}
    ]).flat()
  ];
  const query='Ahora redacta un correo formal para solicitar una reunión.';
  assert.equal(isCoreNewTask(query),true);
  assert.equal(isCoreNewTask('Ahora, redacta un correo formal.'),true);
  assert.equal(isCoreNewTask('Necesito redactar un correo para otro trámite.'),true);
  assert.equal(isCoreNewTask('Quiero que generes una presentación nueva.'),true);
  assert.equal(isCoreNewTask('Quiero que mejores esa imagen.'),false);
  assert.equal(isCoreNewTask('Analiza esta foto nueva.'),true);
  assert.equal(isCoreNewTask('Analiza esa foto otra vez.'),false);
  const options=chooseCoreContextOptions('conversation',query);
  assert.equal(options.newTask,true);
  const context=buildConversationContext(history,query,options);
  const combined=context.map(item=>item.content).join('\n');
  assert.doesNotMatch(combined,/foto-anterior\.jpg/);
  assert.doesNotMatch(combined,/fachada azul/);
  assert.ok(context.length<=4);
});
