# Astrobio backend

Sentetik astronot veri seti: başlangıçta `ensureCrewDataset` ayrı ve sürümlü `synthetic_crew_readings` tablosuna 4 kişi × 90 gün × 3 görev için 1.080 snapshot ekler. `INSERT OR IGNORE` mevcut veriyi değiştirmez; manuel check-in'ler yalnız ilgili gün için önceliklidir. Korumalı `/api/crew-data` uç noktası rol filtresi, ölçüm günleri ve hesaplanan korelasyonlarla yeni Crew Data ekranını besler. [Veri kaynağı ve sınırlar](../docs/SYNTHETIC_CREW_DATA.md).

Sorumlu: **Muhammet Kerim Şahin**. Node 24+ HTTP sunucusu ve yerleşik SQLite kullanılır. Node üretim çalışma zamanı npm bağımlılığı yoktur. `server/static.ts`, `frontend/` arayüzünü aynı origin'de sunar; `/` HTML, `/api/*` mevcut API sözleşmesidir. Public frontend dışındaki proje dosyaları sunulmaz.

## Çalıştırma

```bash
npm ci
npm run dev
```

`.env.example` ilk kurulum için örnektir; mevcut `.env` dosyasını koruyun. İzlemesiz çalıştırma: `npm start` veya `npm run server`. Varsayılan adres `http://127.0.0.1:8787`; sağlık kontrolü `/api/health`.

| Ayar | Varsayılan / amaç |
|---|---|
| `API_PORT` | `8787` |
| `DB_FILE` | `data/crew-health.sqlite`; eski kayıtlarla uyumluluk için korunur |
| `GEMINI_API_KEY` | Boşsa bulut yeniden ifade etme kapalı |
| `GEMINI_MODEL` | İsteğe bağlı model adı |
| `LOCAL_AI_ENABLED` | `false`; deneysel yerel açıklama için `true` |
| `LOCAL_AI_URL` | `http://127.0.0.1:11434`; yalnız sayısal loopback |
| `LOCAL_AI_MODEL` | Boş; kurulu/doğrulanmış yerel Ollama aliası seçilmeli |
| `LOCAL_AI_TIMEOUT_MS` | `90000`; 1000–120000 aralığı |

Yerel AI, `server/localAi.ts` içindeki bağımsız Ollama adaptörüdür; model indirmez veya başlatmaz. `/api/ai/status` ve rol kontrollü `/api/ai/explain` endpointleri eklendi. Araştırma ve kullanıcı tarafından tamamlanacak kurulum adımları: [LOCAL_AI.md](../docs/LOCAL_AI.md). `npm run ai:check` kurulu aliası kontrol eder; kapalı/hazır değilse hata çıkış kodu verir. `.env` içindeki `LOCAL_AI_*` ayarları Ollama daemon'unu değil yalnız Astrobio bağlantısını yapılandırır.

Clone sonrası `npm run setup:local-ai`, onaylı indirme/üretim testi/yerel ayar yazımını tek komutta yapar. Ollama servisinin ve sürücünün önceden kurulmuş olması gerekir; araç eksikleri bildirir, otomatik sistem kurulumu yapmaz. İlk başarılı çalıştırmanın `local-ai/model-lock.json` dosyası ekipçe incelenip Git'e eklenmelidir.

İki-model akışı: `/api/chat`, `server/conversation.ts` ve `server/directChat.ts`. Bulgu seçimi gerekmeden genel sohbet Qwen3 1.7B'ye, sağlık eğitimi soruları MedGemma'ya gider. `npm run setup:companion` seçili varsayılan `qwen3:1.7b` modelini ayrı ayar/kilitle kurar; mevcut özel modeller korunur. Sağlık metni iletişim modeline yeniden yazdırılmaz. Ses API'si `server/voice.ts`, CPU servisi `tools/voice/`, ön plan başlatıcısı `npm run voice:server` içindedir. Tam `setup:local-ai` medical→companion→voice aşamalarını onayla hazırlar. Sesi atlamak için `--skip-voice`, yalnız ses için `npm run setup:voice`. Kurulum API başlangıcında çalışmaz. Ana Node API'nin npm çalışma zamanı bağımlılığı hâlâ yoktur; Python ses bileşeni ayrıdır. [İki-model/ses rehberi](../docs/DUAL_AGENT_VOICE.md).

## Başka proje ile kullanım

Mevcut göreli import yapısını koruyarak `server/` ve `src/` modüllerini, kök yapılandırmayı, lisansı ve veri/kaynak belgelerini birlikte taşıyabilirsiniz. `server/reword.js` opsiyonel özelliğin iç servisidir; Node API bu dosyayı anahtar olmasa da import eder. Testler geliştirme araçları gerektirir; Node API'nin çalışma zamanı yalnız Node yerleşik modüllerine dayanır.

`.env`, oturumlar ve veritabanındaki sağlık kayıtlarını başka depoya kopyalamayın. [LICENSE](../LICENSE) GNU GPL v3 metnini içerir; dağıtımdan önce kod ve veri için geçerli lisans/atıf koşullarını inceleyin. Orijinal araştırma kökenini silmeyin.

## Yeni frontend / dağıtım

- [API sözleşmesi](../docs/API.md) ve [frontend rehberi](../docs/FRONTEND_HANDOFF.md) kullanılmalı.
- Ayrı frontend geliştirme sunucusu `/api` çağrılarını bu sunucuya proxy etmelidir; backend'in kendisinde Vite veya statik dosya sunumu yoktur.
- Üretimde HTTPS reverse proxy üzerinden aynı origin kullanın. Sunucu `127.0.0.1` üzerinde dinler; CORS herkese açılmamıştır.
- Eski statik Vercel demo ve bağımsız Vercel yeniden ifade etme fonksiyonu kaldırıldı. Tek giriş noktası `server/index.ts` dosyasıdır; `/api/reword` oturum kontrollüdür.
- `npm run build` yalnız tip kontrolüdür; `dist/` oluşturulmaz. Dağıtımda Node 24+ ile `npm start` çalıştırılır.

## Korunan davranışlar

API yolları, rol filtreleri, gecikme simülasyonu ve varsayılan veritabanı adı değişmedi. Check-in hâlâ kişi+gün anahtarlı tam günlük kayıttır. Ortam değiştirmek bağımsız görev veritabanı oluşturmaz.

Ortak PIN yalnız demo içindir. Oturumlar 12 saatte sona erer; girişler socket IP başına dakikada 10 istekle sınırlıdır. Proxy arkasında güvenilir istemci IP'si ve dağıtık kota tasarımı ayrıca gerekir. Sürüm kontrollü migration, pagination, disk/TLS şifrelemesi ve gerçek kimlik sistemi üretim öncesi işlerdir.
