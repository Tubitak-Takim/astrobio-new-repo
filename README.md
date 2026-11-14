# Astrobio

Uzay görevleri için açıklanabilir sağlık değerlendirme **backend'i**. Node.js HTTP API, SQLite, Dünya/uzay kural karşılaştırması ve simüle görev verileri içerir.

> **Bu bir tıbbi cihaz değildir.** Mürettebat ve uçuş sırasındaki ölçümler simüledir; klinik doğrulama yapılmamıştır. Kaynaklı kuralların bulunması klinik güvenilirlik garantisi vermez.

**Frontend bu depodan kaldırılmıştır.** Ekibimiz arayüzü sıfırdan geliştirecek. React ekranları, stiller, 3D modeller, tarayıcı demo arka ucu ve eski statik demo dağıtımı artık bu sürümün parçası değildir. Backend çalıştırıldığında web sayfası açılmaz; API kullanılır.

## Ekip

| Ekip üyesi | Görev |
|---|---|
| Işıkhan IŞIK | AI-ML Developer |
| Muhammet Kerim Şahin | Backend Development |
| Elif Nur Özek | Frontend |
| Zehra Kaygısız | Integration and Testing |

[Görev dağılımı ve çalışma akışı](TEAM.md)

## Yerel çalıştırma

**Node.js 24 veya üzeri** gerekir; harici veritabanı servisi gerekmez.

```bash
npm ci
```

İlk kurulumda `.env.example` dosyasını `.env` olarak kopyalayın; mevcut `.env` dosyanız varsa üzerine yazmayın. Gemini anahtarı isteğe bağlıdır, boş kalabilir.

```bash
npm run dev
```

Geliştirme komutu yalnız API'yi başlatır ve dosya değişikliklerinde yeniden yükler. İzleme olmadan çalıştırmak için `npm start` veya `npm run server` kullanın.

- API: **http://127.0.0.1:8787/api**
- Sağlık kontrolü: **http://127.0.0.1:8787/api/health**
- Varsayılan SQLite dosyası: `data/crew-health.sqlite`
- Demo PIN: **`2026`**; kullanıcı kimlikleri: `C1`, `C2` (CMO), `C3`, `C4`, `FS` (Dünya).

Mevcut veritabanı adı ve kayıtlar korunmuştur. `DB_FILE` ile başka dosya, `API_PORT` ile başka port seçilebilir. Eski `VITE_BACKEND_MODE` ve `API_PROXY_TARGET` değişkenleri artık bu backend tarafından kullanılmaz; mevcut `.env` dosyasının değiştirilmesi gerekmez.

### Clone sonrası yerel AI kurulumu

Node 24+ ve çalışan bir **yerel Ollama servisi** gerekir. Ollama/sürücü kurulumu için araç gerekirse talimat verir; otomatik sistem kurulumu yapmaz.

```bash
npm ci
npm run setup:local-ai
npm run dev
```

Kurulum komutu onayınızla `medgemma1.5:4b` modelini indirir veya mevcut modeli kullanır; kısa bir üretim testi yapar, CPU/GPU durumunu bildirir ve `.env` içindeki yerel AI alanlarını etkinleştirir. Başka bir model zaten yapılandırılmışsa korunur. Diğer ayarlar değişmez; değiştirilen mevcut `.env` yedeklenir. Model ağırlıkları Git'e eklenmez.

İlk başarılı kurulum `local-ai/model-lock.json` oluşturur. Ekipçe kökeni/digest'i inceledikten sonra bu küçük dosyayı Git'e ekleyin; sonraki kurulumlar farklı digest'i sessizce kabul etmez. Yardım: `npm run setup:local-ai -- --help`. Ayrıntılar ve lisans/onay koşulları: [yerel AI rehberi](docs/LOCAL_AI.md).

## API'yi hızlı deneme

```bash
curl http://127.0.0.1:8787/api/health

curl -X POST http://127.0.0.1:8787/api/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"C2","pin":"2026"}'
```

Giriş yanıtındaki `token` değerini aşağıda kullanın:

```bash
curl 'http://127.0.0.1:8787/api/assessment?day=60&mission=mars&mode=space' \
  -H 'Authorization: Bearer TOKEN_BURAYA'
```

API; rol kontrollü check-in, not, görev, mesaj, gecikmeli rapor ve acil durum eğitim kaydı saklar. `/api/assessment` yetkinize göre bulguları, kaynaklarını ve rapor metnini döndürür. Başlangıç veri ve kural modülleri React'tan bağımsızdır.

## Yeni frontend

Teknoloji veya tasarım seçimi henüz yapılmadı; bu depoya yerine geçecek bir arayüz eklenmedi. Yeni arayüz `/api` uç noktalarına bağlanabilir. Ayrı geliştirme sunucusunda `/api` proxy'si, dağıtımda HTTPS altında aynı origin reverse proxy kullanın. Backend herkese açık CORS izni vermez ve loopback üzerinde dinler.

- [API sözleşmesi](docs/API.md)
- [Frontend entegrasyon rehberi](docs/FRONTEND_HANDOFF.md)
- [Backend geliştirme ve yeniden kullanım](server/README.md)
- [AI-ML çalışma alanı](docs/AI_ML.md)
- [Yerel AI / MedGemma araştırması ve kurulum hazırlığı](docs/LOCAL_AI.md)
- [Kalite kontrolü ve bilinen sınırlar](docs/QUALITY.md)
- [API demo senaryosu](DEMO_SCRIPT.md)

## Kontroller

```bash
npm test
npm run build
npm audit
```

Yerel AI adaptörü `server/localAi.ts` içindedir; varsayılan kapalıdır. Açıkça çalıştırılan kurulum aracı onayla modeli hazırlar; normal API başlangıcı veya `npm ci` model indirmez. `npm run ai:check` yalnız yapılandırılmış Ollama aliasını kontrol eder; kurulum aracındaki üretim testiyle aynı şey değildir. Kullanıcının seçtiği Ollama etiketi `medgemma1.5:4b` varsayılan kurulum adayıdır; bu etiket tek başına resmi Google dağıtımı/köken kanıtı sayılmaz.

`npm run build` yalnız TypeScript doğrulaması yapar; frontend paketi veya `dist/` üretmez. Node yerleşik TypeScript desteğiyle kaynak dosyaları doğrudan çalıştırır. Testler geçici veritabanı kullanır; yerel kayıtlarınızı değiştirmez. CI aynı kontrolleri çalıştırır.

## Yapı

```text
server/                 HTTP API, SQLite, istek güvenliği, isteğe bağlı Gemini
local-ai/               Yerel model içeri aktarma şablonu (ağırlık içermez)
scripts/                Onaylı yerel AI kurulumu ve hazır olma kontrolü
src/triage.ts           Dünya/uzay kuralları ve sağlık tipleri
src/model.ts            Simülasyon, ölçüm kaynakları, görev/rapor hesapları
src/assessment.ts       Yeni frontend için değerlendirme sözleşmesi
src/access.ts           Veri erişim politikaları
src/validate.ts         Ölçüm, görsel ek ve acil durum doğrulaması
src/handbook.ts         Anahtar kelimeli asistan mantığı (HTTP rotası henüz yok)
src/data/               Mürettebat, görevler, kaynaklar ve eğitim içerikleri
data/osdr/              NASA OSD-569 referans verisi
docs/                   API ve ekip devir belgeleri
```

## Kaynaklar, köken ve lisans

Astrobio, önceki **Crew Health Monitor** prototipinin backend ve alan mantığı temel alınarak uyarlanmıştır. Önceki sürümün geçmişi `PROGRESS.md`, araştırma notları `RESEARCH_LOG.md` içindedir. Bu belgelerdeki eski ekran ve canlı demo açıklamaları güncel sürümün özellikleri değildir. `CHALLENGE.md` önceki prototipin yarışma kapsam kaydıdır.

- Kan sayımı başlangıç değerleri/referans aralıkları: [NASA OSDR OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569). Günlük uçuş ölçümleri gerçek değildir.
- NASA [beş tehlike](https://www.nasa.gov/hrp/hazards/), [riskler](https://www.nasa.gov/hrp/risks/) ve [devam eden araştırmalar](https://www.nasa.gov/hrp/ongoing-hrp-research/) sağlık içeriklerinin temel kaynaklarıdır.
- Canadian Space Agency [radyasyon takibi](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) ve [uzay araştırmalarının amacı](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) kaynakları araştırma kayıtlarında korunur.
- Eşiklerin `verified`, `partial`, `demo` durumları `src/data/sources.ts` içindedir. Bunlar projenin kaynak inceleme etiketleridir, klinik onay değildir.
- Depodaki [GNU GPL v3 lisans metni](LICENSE) korunmuştur; yeniden kullanım ve dağıtımda kaynak/atıf ve lisans yükümlülüklerini inceleyin. Üçüncü taraf veri koşulları ayrıca geçerlidir.
- Kaldırılan anatomik varlıkların önceki atıfları: BodyParts3D, © The Database Center for Life Science, CC BY 4.0; HRA 3D Reference Organs / HuBMAP, CC BY 4.0. Bu sürüm bu modelleri içermez.

Gerçek kimlik sistemi, veri şifreleme, ölçüm bazlı geçmiş modeli ve klinik doğrulama olmadan gerçek sağlık verileriyle üretimde kullanmayın.
