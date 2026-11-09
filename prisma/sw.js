/* Prisma Space PWA: only static same-origin resources, network-first. */
const CACHE='prisma-space-static-v1';
const CORE=['./','./index.html','./styles.css','./assets/prisma-app-192.png','./assets/prisma-app-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{}));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('prisma-space-static-')&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
 ]));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return;
 const isShell=request.mode==='navigate'||/\.(?:css|js|html|svg|png|webmanifest)$/.test(url.pathname);
 if(!isShell)return;
 event.respondWith((async()=>{
  try{
   const network=await fetch(request);
   if(network.ok&&network.type==='basic'){
    const cache=await caches.open(CACHE);
    cache.put(request,network.clone()).catch(()=>{});
   }
   return network;
  }catch{
   const hit=await caches.match(request);
   if(hit)return hit;
   if(request.mode==='navigate'){
    const home=await caches.match('./index.html');
    if(home)return home;
   }
   return new Response('Sin conexión. Conéctate para utilizar Prisma Space.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
 })());
});
