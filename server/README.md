# Backend'i yeniden kullanma

Sorumlu: **Muhammet Kerim Şahin**. Bu katman Node 24+ HTTP sunucusu ve yerleşik SQLite kullanır; React/Three.js çalışma zamanı bağımlılığı yoktur.

## Yerel çalıştırma

```bash
npm ci
cp .env.example .env
npm run server
```

Varsayılan adres: `http://127.0.0.1:8787`. Sağlık kontrolü: `GET /api/health`. `.env` içindeki `DB_FILE` ile ayrı bir veritabanı seçilebilir; mevcut dosyalar silinmez. `npm run dev` API ve referans frontend'i birlikte çalıştırır.

## Başka frontend/depo ile kullanım

Yalnızca `server/index.ts` kopyalamak yeterli değildir. Mevcut göreli import yapısını koruyarak şu dosyaları birlikte taşıyın:

- `server/index.ts`, `server/http.ts`
- `api/reword.js` (opsiyonel özellik kapalı olsa da sunucu bu modülü import eder)
- `src/access.ts`, `src/assessment.ts`, `src/validate.ts`, `src/model.ts`, `src/triage.ts`
- `src/data/simulatedCrew.ts`, `src/data/users.ts`, `src/data/missions.ts`, `src/data/sources.ts`
- Kaynak ve veri kredileri ile ilgili araştırma belgeleri

Bu, bugünkü bağımlılık listesidir; yeni importlar eklendiğinde tekrar kontrol edin. `api/reword.d.ts` dosyasını da TypeScript araçları için taşıyabilirsiniz. Sunucu testlerini yeni depoya uyarlayın. `public/anatomy/`, ekranlar ve stiller backend için gerekmez. Veritabanını, oturumları ve `.env` anahtarlarını kopyalamayın.

**Lisans notu:** Bu kopyada uygulama kodu için genel bir `LICENSE` dosyası bulunmuyor. Dosyalara erişilebilmesi yeniden dağıtım izni anlamına gelmez. Kaynak sahibinin iznini ve yarışmanın özgünlük/atıf koşullarını kontrol edin. Anatomik modellerin ve NASA verilerinin ayrı kaynak/atıf koşulları vardır; README kredilerini silmeyin.

## API sınırı ve dağıtım

- Yeni frontend için [API sözleşmesini](../docs/API.md) kullanın. Sağlık değerlendirmeleri artık sunucudan alınabilir.
- Geliştirmede frontend sunucusundan `/api` proxy'si kullanın. `API_PROXY_TARGET` başka backend adresine yönlendirebilir.
- Üretimde statik frontend ile Node API'yi aynı origin arkasında HTTPS reverse proxy üzerinden yayınlayın. Sunucu özellikle loopback üzerinde dinler; doğrudan genel ağa açılmaz. CORS bilerek herkese açılmamıştır.
- Statik Vercel demo, SQLite backend'in dağıtımı değildir. `api/reword.js` tek başına tam sunucuyu sağlamaz.
- `npm run build` frontend üretir ve tip kontrolü yapar; backend binary'si üretmez. Backend Node ile `.ts` dosyasından çalışır.
- Gerçek sunucu kullanan frontend'i `VITE_BACKEND_MODE=server` ile derleyin; böylece bağlantı hatası tarayıcı demo verisine geçişe neden olmaz. Bu bir derleme zamanı ayarıdır; değişiklikten sonra Vite'ı yeniden başlatın/derleyin.

## Güvenlik sınırları

Ortak PIN halen demo içindir. Oturumlar 12 saat sonra sona erer; girişler IP başına dakikada 10 istekle sınırlıdır. Proxy arkasında bütün kullanıcılar aynı socket IP'sini paylaşabilir; üretimde güvenilir proxy ve dağıtık hız sınırlaması ayrıca tasarlanmalıdır.

Sağlık verisi için gerçek kimlik sistemi, TLS, disk şifreleme, yedekleme, denetim izi, veri saklama politikası ve klinik doğrulama olmadan üretime çıkmayın. SQLite şeması eksik kolonları ekler; bu henüz sürümlü migration altyapısı değildir.
