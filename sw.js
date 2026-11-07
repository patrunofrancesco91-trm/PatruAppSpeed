const CACHE="pst-v417-sw-path-fix";
const STATIC=["./manifest.json","./logo.png","./hero.jpg","./icon-192.png","./icon-512.png","./favicon.png"];
const CORE=["./","./index.html","./styles.css","./app.js","./config.js"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll([...CORE,...STATIC])));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  const sameOrigin=url.origin===self.location.origin;
  if(!sameOrigin)return;
  const path=url.pathname;
  const networkFirst=path.endsWith("/app.js")||path.endsWith("/styles.css")||path.endsWith("/config.js")||path.endsWith("/index.html")||path.endsWith("/PatruAppSpeed/")||path.endsWith("/PatruAppSpeed");
  if(networkFirst){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request,{cache:"no-store"});
        const cache=await caches.open(CACHE);
        if(fresh.ok)cache.put(event.request,fresh.clone());
        return fresh;
      }catch(_){
        return (await caches.match(event.request,{cacheName:CACHE}))||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request,{cacheName:CACHE});
    if(cached)return cached;
    const fresh=await fetch(event.request);
    if(fresh.ok){const cache=await caches.open(CACHE);cache.put(event.request,fresh.clone());}
    return fresh;
  })());
});

self.addEventListener("push",event=>{
 let data={title:"Patruno Speed Team",body:"Hai una nuova notifica.",url:"./",kind:"general"};
 try{if(event.data)data={...data,...event.data.json()}}catch(_){try{data.body=event.data.text()}catch(__){}}
 event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"./icon-192.png",badge:"./icon-192.png",tag:data.tag||("pst-"+(data.kind||"general")),data:{url:data.url||"./"}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=event.notification.data?.url||"./";
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
   for(const client of list){if("navigate" in client)client.navigate(url).catch(()=>{});if("focus" in client)return client.focus();}
   if(clients.openWindow)return clients.openWindow(url);
 }));
});
