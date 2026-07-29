// Centro de Viagem — service worker
// Guarda o "esqueleto" do app (HTML, fontes, bibliotecas, ladrilhos de mapa já vistos)
// para que o sistema continue abrindo e mostrando os últimos dados mesmo sem internet.
// Dados ao vivo (Supabase) NUNCA passam por aqui — sempre vão direto pra rede.

var CACHE_VERSION = 'centro-viagem-v1';
var APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

var RUNTIME_CACHE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'tile.openstreetmap.org'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      return Promise.all(APP_SHELL.map(function(url){
        return cache.add(url).catch(function(){ /* ignora falha individual */ });
      }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE_VERSION; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isRuntimeCacheable(url){
  try{
    var host = new URL(url).host;
    return RUNTIME_CACHE_HOSTS.indexOf(host) !== -1;
  }catch(e){ return false; }
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return; // nunca intercepta POST/PATCH (salvamentos no Supabase)

  // Navegação (a própria página): rede primeiro, cache como reserva offline
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){ return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Bibliotecas, fontes e ladrilhos de mapa já vistos: cache primeiro, rede como atualização
  if(isRuntimeCacheable(req.url)){
    event.respondWith(
      caches.match(req).then(function(cached){
        var networkFetch = fetch(req).then(function(res){
          if(res && res.ok){
            var copy = res.clone();
            caches.open(CACHE_VERSION).then(function(cache){ cache.put(req, copy); });
          }
          return res;
        }).catch(function(){ return cached; });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Todo o resto (Supabase, geocodificação etc.) vai direto pra rede, sem cache
});
