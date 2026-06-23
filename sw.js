const CACHE_NAME = 'expence-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['./index.html','./manifest.json','./icon-192.png','./icon-512.png','./logo.png'])
        .catch(()=>{})
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('firebaseapp.com') ||
     e.request.url.includes('googleapis.com') ||
     e.request.url.includes('gstatic.com') ||
     e.request.url.includes('firestore.googleapis')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if(res && res.status === 200){
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
  );
});
