// Opt-in, serial live evaluation. Never downloads models or modifies the VPS.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {inferQueen,queenConfig} from '../functions/_lib/queen.js';
import {queenMessages} from '../functions/api/core/plan.js';
import {QUEEN_PLAN_SCHEMA,validateQueenPlan} from '../src/queen-plan.js';
import {retrieveQueenTools} from '../src/queen-contracts.js';
import {planWithPrismaCore} from '../src/developer-api.js';
const args=process.argv.slice(2),live=args.includes('--live');
const fileArg=args.find(a=>a.startsWith('--output='));
const output=resolve(fileArg?fileArg.slice(9):'work/queen-evaluation.json');
const cases=JSON.parse(await readFile(new URL('./queen-cases.json',import.meta.url),'utf8'));
const history=await readFile(new URL('../docs/core-matrix-388.csv',import.meta.url),'utf8');
const report={date:new Date().toISOString(),mode:live?'live':'offline',historicalMatrix:{source:'docs/core-matrix-388.csv',preserved:true,originalBaselineRows:381,currentRecordedRows:388,reexecuted:false},
 actualModelRequests:0,inputTokens:0,outputTokens:0,externalCostUsd:0,autonomyPercent:null,calibratedConfidence:null,rows:[]};
let blocked=null;if(live)try{queenConfig(process.env);}catch(e){blocked=e.code;}
for(const c of cases){
 const previous=planWithPrismaCore(c);
 const row={id:c.id,baseline:{type:previous.planner.type,toolIds:previous.planner.steps.map(s=>s.tool_id)},queen:{status:live?'pending':'not-run'}};
 if(blocked)row.queen={status:'blocked',code:blocked};
 else if(live){
  let contracts=retrieveQueenTools(c.text,c.files,6),repair='';const started=Date.now();
  for(let attempt=0;attempt<2;attempt++){
   try{
    const result=await inferQueen(process.env,queenMessages({...c,context:{},contracts,providers:[],repair}),QUEEN_PLAN_SCHEMA);
    report.actualModelRequests++;report.inputTokens+=result.usage.inputTokens||0;report.outputTokens+=result.usage.outputTokens||0;
    if(result.plan.intent==='retrieve'&&attempt===0){contracts=retrieveQueenTools(result.plan.search,c.files,6);continue;}
    const p=validateQueenPlan(result.plan,{files:c.files,objective:c.text,allowedToolIds:contracts.map(t=>t.id)}),ids=p.steps.map(s=>s.tool_id);
    const passed=c.intents.includes(p.intent)&&!(c.forbidden||[]).some(id=>ids.includes(id))&&(!c.expectedTools||JSON.stringify(ids)===JSON.stringify(c.expectedTools))&&(!c.allowedTools||ids.every(id=>c.allowedTools.includes(id)));
    row.queen={status:'measured',passed,intent:p.intent,toolIds:ids,durationMs:Date.now()-started,inferences:attempt+1,executed:false,verified:false};break;
   }catch(error){
    row.queen={status:'failed',code:error.code||'PLAN_REJECTED',durationMs:Date.now()-started};
    // No retry on availability/auth/context errors; preserve scarce VPS time.
    if(error.code||attempt===1)break;repair='PLAN_REJECTED';
   }
  }
 }
 report.rows.push(row);
}
if(!history.includes('index,n,grupo,caso,herramienta'))throw Error('Historical matrix missing');
const measured=report.rows.filter(r=>r.queen.status==='measured');
report.semanticEvaluation={measured:measured.length,passed:measured.filter(r=>r.queen.passed).length,accuracy:measured.length?measured.filter(r=>r.queen.passed).length/measured.length:null,
 note:'Plan selection only. Does not measure task execution, artifact quality or operational autonomy.'};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,mode:report.mode,actualModelRequests:report.actualModelRequests,blocked,semanticEvaluation:report.semanticEvaluation}));
