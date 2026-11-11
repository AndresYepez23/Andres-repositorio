import assert from 'node:assert/strict';
import { handleWelcomeRequest } from '../functions/api/auth/welcome.js';

function mockD1(){
 const rows=new Map();
 return {
  rows,
  prepare(sql){
   let values=[];
   const statement={
    bind(...args){values=args;return statement;},
    async first(){
     if(sql.includes('SELECT status FROM prisma_welcome_emails'))
      return rows.get(String(values[0]))||null;
     return null;
    },
    async run(){
     if(sql.includes('INSERT INTO prisma_welcome_emails')){
      const [id,email]=values.map(String);
      const existing=rows.get(id);
      if(!existing||existing.status==='failed'||
         (existing.status==='pending'&&Date.now()-existing.createdAt>5*60*1000)){
       rows.set(id,{email,status:'pending',createdAt:Date.now()});
       return {meta:{changes:1}};
      }
      return {meta:{changes:0}};
     }
     if(sql.includes("SET status='sent'")){
      const row=rows.get(String(values[0]));
      if(row)rows.set(String(values[0]),{...row,status:'sent'});
      return {meta:{changes:row?1:0}};
     }
     if(sql.includes("SET status='failed'")){
      const row=rows.get(String(values[0]));
      if(row)rows.set(String(values[0]),{...row,status:'failed'});
      return {meta:{changes:row?1:0}};
     }
     return {meta:{changes:0}};
    }
   };
   return statement;
  }
 };
}

let currentUser={
 id:'user-aurora-1',
 email:'new-user@example.com',
 email_confirmed_at:'2026-11-11T15:00:00Z',
 created_at:'2026-11-11T15:00:00Z',
 user_metadata:{full_name:'Andrés <Simón>'}
};
const db=mockD1();
const calls=[];
let failResend=false;
const fetchMock=async(url,init={})=>{
 if(String(url).endsWith('/auth/v1/user'))return Response.json(currentUser);
 if(String(url)==='https://api.resend.com/emails'){
  calls.push({headers:init.headers,body:JSON.parse(init.body)});
  if(failResend)return Response.json({message:'temporary provider failure'},{status:500});
  return Response.json({id:'email-test-1'},{status:200});
 }
 throw new Error('Unexpected fetch target: '+url);
};
const env={
 PRISMA_SUPABASE_URL:'https://project.supabase.co',
 PRISMA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
 RESEND_API_KEY:'re_test',
 PRISMA_RATE_DB:db
};
const request=()=>new Request('https://prismaspace.space/api/auth/welcome',{
 method:'POST',headers:{Authorization:'Bearer user-access-token'}
});
const call=(overrides={})=>handleWelcomeRequest({request:request(),env:{...env,...overrides}},fetchMock);

const unauthorized=await handleWelcomeRequest({
 request:new Request('https://prismaspace.space/api/auth/welcome',{method:'POST'}),
 env
},fetchMock);
assert.equal(unauthorized.status,401);

const success=await call();
assert.equal(success.status,200);
assert.equal(db.rows.get(currentUser.id).status,'sent');
assert.equal(calls.length,1);
assert.equal(calls[0].body.to[0],currentUser.email);
assert.equal(calls[0].body.from,'Prisma Space <no-reply@prismaspace.space>');
assert.equal(calls[0].headers['Idempotency-Key'],'prisma-welcome-'+currentUser.id);
assert.match(calls[0].body.html,/Andrés &lt;Simón&gt;/);
assert.match(calls[0].body.text,/La sincronización es opcional/);

const duplicate=await call();
assert.equal(duplicate.status,200);
assert.equal((await duplicate.json()).alreadySent,true);
assert.equal(calls.length,1,'A user receives at most one welcome email');

currentUser={...currentUser,id:'user-unverified',email_confirmed_at:null,confirmed_at:null};
const unverified=await call();
assert.equal(unverified.status,403);
assert.equal(calls.length,1);

currentUser={...currentUser,id:'user-retry',email:'retry@example.com',email_confirmed_at:'2026-11-11T15:00:00Z'};
failResend=true;
const failed=await call();
assert.equal(failed.status,502);
assert.equal(db.rows.get(currentUser.id).status,'failed');
failResend=false;
const retried=await call();
assert.equal(retried.status,200);
assert.equal(db.rows.get(currentUser.id).status,'sent');
assert.equal(calls.length,3);

const missingConfig=await call({RESEND_API_KEY:''});
assert.equal(missingConfig.status,503);
console.log('Prisma Aurora welcome email regressions passed.');
