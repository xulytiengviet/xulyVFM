const GDAL_CACHE="xulyvfm-gdal3js-2.8.1";
const GDAL_PREFIX="https://cdn.jsdelivr.net/npm/gdal3.js@2.8.1/dist/package/";

self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));

self.addEventListener("fetch",event=>{
  const url=event.request.url;
  if(!url.startsWith(GDAL_PREFIX))return;
  event.respondWith((async()=>{
    const cache=await caches.open(GDAL_CACHE);
    const cached=await cache.match(event.request);
    if(cached)return cached;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(event.request,response.clone());
    return response;
  })().catch(()=>fetch(event.request)));
});
