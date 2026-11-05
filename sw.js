const CACHE='pst-v392-fix-copy-single-session';
const ASSETS=['./','./index.html','./styles.css','./app.js','./config.js','./manifest.json','./assets/logo.png','./assets/hero.jpg','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));

self.addEventListener("push",event=>{
 let data={title:"Patruno Speed Team",body:"Hai una nuova notifica.",url:"./",kind:"general"};
 try{if(event.data)data={...data,...event.data.json()}}catch(_){try{data.body=event.data.text()}catch(__){}}
 event.waitUntil(self.registration.showNotification(data.title,{
   body:data.body,
   icon:"./assets/icon-192.png",
   badge:"./assets/icon-192.png",
   tag:data.tag||("pst-"+(data.kind||"general")),
   data:{url:data.url||"./"}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=event.notification.data?.url||"./";
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
   for(const client of list){
     if("navigate" in client)client.navigate(url).catch(()=>{});
     if("focus" in client)return client.focus();
   }
   if(clients.openWindow)return clients.openWindow(url);
 }));
});
