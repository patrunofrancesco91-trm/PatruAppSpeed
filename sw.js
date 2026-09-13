const CACHE='pst-v34-attendance-dates';
const ASSETS=['./','./index.html','./styles.css','./app.js','./config.js','./manifest.json','./assets/logo.png','./assets/hero.jpg','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));

self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
   for(const client of list){if("focus" in client)return client.focus()}
   if(clients.openWindow)return clients.openWindow("./");
 }));
});
