import { renderWelcomeEmail } from '../../_lib/welcome-email.js';

const json=(body,status=200)=>Response.json(body,{
 status,
 headers:{
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
 }
});

export async function handleWelcomeRequest({request,env},fetcher=fetch){
 const authorization=request.headers.get('Authorization')||'';
 const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 if(!token)return json({ok:false,error:'unauthorized'},401);
 const supabaseUrl=String(env.PRISMA_SUPABASE_URL||'').replace(/\/+$/,'');
 const publishableKey=String(env.PRISMA_SUPABASE_PUBLISHABLE_KEY||'').trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)||
    !publishableKey||!env.RESEND_API_KEY||!env.PRISMA_RATE_DB?.prepare){
  return json({ok:false,error:'service_unavailable'},503);
 }
 let user;
 try{
  const authResponse=await fetcher(supabaseUrl+'/auth/v1/user',{
   headers:{apikey:publishableKey,Authorization:'Bearer '+token}
  });
  if(!authResponse.ok)return json({ok:false,error:'unauthorized'},401);
  user=await authResponse.json();
 }catch{
  return json({ok:false,error:'auth_unavailable'},502);
 }
 const email=String(user?.email||'').trim().toLowerCase();
 const confirmed=Boolean(user?.email_confirmed_at||user?.confirmed_at);
 if(!user?.id||!email||!confirmed)return json({ok:false,error:'verified_email_required'},403);

 const db=env.PRISMA_RATE_DB;
 let claim;
 try{
  claim=await db.prepare(
   `INSERT INTO prisma_welcome_emails (user_id,email,status,created_at)
    VALUES (?,?,'pending',CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
     email=excluded.email,status='pending',created_at=CURRENT_TIMESTAMP,sent_at=NULL
    WHERE prisma_welcome_emails.status='failed'
       OR (prisma_welcome_emails.status='pending' AND prisma_welcome_emails.created_at<datetime('now','-5 minutes'))`
  ).bind(String(user.id),email).run();
 }catch(error){
  console.error('Prisma welcome email queue:',String(error?.message||error).slice(0,120));
  return json({ok:false,error:'queue_unavailable'},503);
 }
 const changes=Number(claim?.meta?.changes??claim?.changes??0);
 if(changes!==1){
  const existing=await db.prepare('SELECT status FROM prisma_welcome_emails WHERE user_id=?')
   .bind(String(user.id)).first().catch(()=>null);
  if(existing?.status==='sent')return json({ok:true,alreadySent:true});
  return json({ok:true,pending:true},202);
 }

 const {html,text}=renderWelcomeEmail(user);
 let delivery;
 try{
  delivery=await fetcher('https://api.resend.com/emails',{
   method:'POST',
   headers:{
    Authorization:'Bearer '+env.RESEND_API_KEY,
    'Content-Type':'application/json',
    'Idempotency-Key':'prisma-welcome-'+String(user.id)
   },
   body:JSON.stringify({
    from:'Prisma Space <no-reply@prismaspace.space>',
    to:[email],
    subject:'Tu espacio en Prisma Space ya está listo',
    html,text,
    tags:[{name:'category',value:'welcome'}]
   })
  });
 }catch(error){
  await db.prepare("UPDATE prisma_welcome_emails SET status='failed' WHERE user_id=? AND status='pending'")
   .bind(String(user.id)).run().catch(()=>{});
  console.error('Prisma welcome delivery:',String(error?.message||error).slice(0,120));
  return json({ok:false,error:'delivery_unavailable'},502);
 }
 if(!delivery.ok){
  await db.prepare("UPDATE prisma_welcome_emails SET status='failed' WHERE user_id=? AND status='pending'")
   .bind(String(user.id)).run().catch(()=>{});
  console.error('Prisma welcome provider status:',delivery.status);
  return json({ok:false,error:'delivery_rejected'},502);
 }
 const result=await delivery.json().catch(()=>({}));
 try{
  await db.prepare("UPDATE prisma_welcome_emails SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'")
   .bind(String(user.id)).run();
 }catch(error){
  // Resend idempotency prevents a duplicate if the client retries after this update fails.
  console.error('Prisma welcome status:',String(error?.message||error).slice(0,120));
  return json({ok:false,error:'delivery_status_unconfirmed'},503);
 }
 return json({ok:true,id:result?.id||null});
}

export function onRequestPost(context){
 return handleWelcomeRequest(context,fetch);
}
