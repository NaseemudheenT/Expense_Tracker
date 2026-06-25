const CACHE='expence-v5';
const FILES=['./index.html','./styles.css','./script.js','./manifest.json','./icon-192.png','./icon-512.png','./logo.png'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES).catch(()=>{})));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(/firebaseapp|googleapis|gstatic|firestore/.test(e.request.url))return;
  e.respondWith(
    fetch(e.request)
      .then(r=>{if(r&&r.status===200){caches.open(CACHE).then(c=>c.put(e.request,r.clone()));}return r;})
      .catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
