const VERSION="__BUILD_VERSION__";const CACHE="prisma-shell-"+VERSION;
const SHELL=["/","/index.html","/styles.css","/assets/prisma-mark.svg","/assets/prisma-app-icon.svg","/assets/prisma-192.png","/assets/prisma-512.png","/manifest.webmanifest"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("prisma-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=="GET"||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/auth/")||url.pathname.startsWith("/functions/")||url.pathname.startsWith("/.well-known/"))return;
 if(req.mode==="navigate"){
  event.respondWith(fetch(req).catch(async()=>await caches.match("/index.html")||Response.error()));
  return;
 }
 if(!/\.(?:js|css|svg|png|webp|ico|webmanifest)$/.test(url.pathname))return;
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}return resp;})));
});
