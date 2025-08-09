/* NJPourDigital SW – offline, background sync, periodic sync */
const CACHE = 'njpd-v3';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/privacy.html'];
const ASSETS = [
  'https://i.ibb.co/RkBKfX4m/logo-square.png',
  'https://i.ibb.co/1YkR7Fdb/real-splash-wwith-logo-2.png'
];

const DB='njpd-queue-db', STORE='outbox';
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function qAdd(x){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).add(x);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function qAll(){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function qDel(ids){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');const st=tx.objectStore(STORE);ids.forEach(id=>st.delete(id));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(u => c.add(new Request(u, {cache:'reload'}))));
    await Promise.allSettled(ASSETS.map(u => c.add(u)));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k===CACHE ? null : caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match('/')) || (await c.match('/index.html')) ||
          new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0a0a0a;color:#e5e7eb;display:grid;place-items:center;min-height:100vh"><main style="max-width:620px;padding:24px;text-align:center"><h1>You\'re offline</h1><p>Reconnect to continue using NJPourDigital.</p></main></body>', {headers:{'Content-Type':'text/html;charset=utf-8'}});
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(req, {mode:'no-cors'});
      const c = await caches.open(CACHE);
      c.put(req, res.clone());
      return res;
    } catch {
      const c = await caches.open(CACHE);
      return (await c.match(req)) || new Response('', {status:504,statusText:'Gateway Timeout'});
    }
  })());
});

self.addEventListener('message', e => {
  const { type, payload } = e.data || {};
  if (type === 'queueForm' && payload) {
    qAdd({kind:'contact', payload, ts:Date.now()}).then(async () => {
      try { if (self.registration.sync) await self.registration.sync.register('sync-contact'); } catch {}
    });
  }
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-contact') {
    e.waitUntil((async () => {
      const items = await qAll();
      const send = items.filter(i => i.kind === 'contact');
      const done = [];
      for (const it of send) {
        try {
          const r = await fetch('https://formspree.io/f/mgvzpjge', {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(it.payload)
          });
          if (r && r.ok) done.push(it.id);
        } catch {}
      }
      if (done.length) await qDel(done);
    })());
  }
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'njpd-periodic') {
    e.waitUntil((async () => {
      const c = await caches.open(CACHE);
      await Promise.allSettled(CORE.map(u => c.add(new Request(u, {cache:'reload'}))));
    })());
  }
});
