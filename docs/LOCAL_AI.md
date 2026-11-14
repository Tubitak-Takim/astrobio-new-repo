# Astrobio yerel AI / MedGemma araştırması ve hazırlığı

Araştırma tarihi: **2026-11-14**. AI-ML: **Işıkhan IŞIK**; backend: **Muhammet Kerim Şahin**; entegrasyon/test: **Zehra Kaygısız**; istemci: **Elif Nur Özek**.

## Clone sonrası önerilen kurulum

Node 24+ ve çalışan Ollama gerekir. Ollama yoksa [resmi indirme sayfasından](https://ollama.com/download) işletim sisteminize uygun kurulumu yapın. Araç yönetici yetkisi istemez, sistem sürücüsü kurmaz ve arka planda servis başlatmaz. Servis kapalıysa kurulum talimatla durur; servis açıldıktan sonra aynı komutu tekrar çalıştırın.

```bash
npm ci
npm run setup:local-ai
npm run dev
```

Komut etkileşimli olarak kullanım koşullarını/indirmeyi/ayar değişikliğini onaylatır. Önceden gözden geçirilmiş otomasyon için:

```bash
npm run setup:local-ai -- --yes
```

`--yes` lisans incelemesinin yerine geçmez; koşulları önceden değerlendirmiş operatörün açık onayıdır. Onay yoksa ve terminal etkileşimli değilse işlem durur. `npm ci` veya normal API başlangıcında gizli model indirme yoktur.

### Aracın yaptığı işler

- Platform/RAM, NVIDIA sürücü görünürlüğü, Ollama CLI ve yerel HTTP servis kontrolü.
- EndeavourOS/Arch + NVIDIA durumunda eksik `ollama-cuda` paketi için uyarı; otomatik sudo yok.
- `.env` içindeki modeli koruma; boşsa kullanıcı tarafından seçilmiş `medgemma1.5:4b` varsayılanı. `--model NAME` açık model değişikliğidir. `LOCAL_AI_*` süreç ortamı değerleri dosyaya göre önceliklidir; `--model` en yüksek önceliğe sahiptir.
- Model kuruluysa yeniden indirmeme; eksikse onay sonrası Ollama HTTP API üzerinden ilerleme göstererek indirme. İndirme en fazla 30 dakika beklenir; kesilirse tekrar çalıştırılabilir.
- Yerel URL doğrulaması ve uzak/bulut alias reddi. Ollama'yı ayrıca `OLLAMA_NO_CLOUD=1` ile çalıştırın.
- Sağlık verisi içermeyen kısa üretim testi; sonra `/api/ps` belleğine göre `GPU`, `MIXED`, `CPU` veya `UNKNOWN` raporu. CPU üzerinde başarılı kurulum mümkündür; GPU hazırmış gibi gösterilmez. Model test sonrası yaklaşık iki dakika bellekte kalır.
- Başarılı testten sonra `.env` içindeki yalnız dört `LOCAL_AI_*` alanını yazma. `API_PORT`, `DB_FILE`, Gemini anahtarı ve diğer değerler korunur. Güncellenen mevcut dosya `.env.setup-backup-*` olarak özel izinlerle yedeklenir; yedekler Git tarafından yok sayılır. Yerel AI etkinleşir; mevcut Gemini anahtarı otomatik temizlenmez.
- Test/indirme başarısızlığında `.env` etkinleştirilmez. Başlamış indirme Ollama önbelleğinde kısmen kalabilir. Dosya değişiklikleri testten sonra, dosya başına atomik yazılır; `.env` ile model kilidi tek bir dosya sistemi işlemi değildir.
- Kurulum sırasında `.env`/kilit başka işlemle değişirse üzerine yazmama; dosya sembolik bağlantıysa otomatik düzenlemeyi reddetme.

### Model kilidi ve tekrar çalıştırma

İlk başarılı kurulum `local-ai/model-lock.json` içine **model adı ve Ollama envanter digest'ini** kaydeder. Ağırlıklar yazılmaz. Ekipçe kökeni inceleyip bu küçük dosyayı commit edin; clone alan kişiler aynı kilidi kullanabilir. Kilit yokken ilk görülen digest kaydedilir; bu, kendiliğinden güvenilir bir model kökeni kanıtlamaz.

Kilitli modelle yeni indirilen/kurulu modelin adı veya digest'i farklıysa kurulum durur. Bilinçli güncelleme:

```bash
npm run setup:local-ai -- --model medgemma1.5:4b --update-lock
```

`--update-lock` farkı kabul etmeye açık izindir; hâlâ etkileşimli onay veya `--yes` gerekir. İncelenmeden kullanmayın. Etiketlerin eski sürümleri kayıt sunucusunda tutulmayabilir; kilit, eski ağırlıkları otomatik geri getirmez. Dağıtım/saklama koşullarına uygun bir arşiv politikası ayrıca gerekebilir.

**Sınır:** Kilit kurulum sırasında kontrol edilir; mevcut inference adaptörü kilidi her istekte doğrulamaz. Sonradan model aliasını elle değiştirmeyin; model değişikliğinde kurulum ve testleri yeniden çalıştırın.

## 1. Önce model adını netleştirelim

Google'ın güncel resmi kataloğunda **MedGemma 7B bulunamadı**:

| Resmi seri | Boyut / özellik |
|---|---|
| MedGemma 1.5 | 4B, multimodal instruction-tuned |
| MedGemma 1 | 4B multimodal; 27B metin ve multimodal varyantlar |

Resmi 1.5 checkpoint örneği: [`google/medgemma-1.5-4b-it`](https://huggingface.co/google/medgemma-1.5-4b-it). Bu, bir Ollama model etiketi değildir. Bir topluluk paketinin adında “7B” yazması onun resmi Google MedGemma sürümü olduğunu kanıtlamaz. Gemma ile MedGemma da aynı model değildir.

İlk araştırmada model seçimi boş bırakılmıştı. Kullanıcı daha sonra **`medgemma1.5:4b`** Ollama etiketini seçip indirdi ve API'den üretilen bir yanıt paylaştı. Kurulum aracı bu etiketi boş yapılandırma için varsayılan aday yapar; runtime'ın kendi varsayılanı hâlâ kapalı/model adı boştur. Etiketin kaynağı ve checkpoint kökeni ayrıca incelenmelidir.

Web arama entegrasyonu çalışmadığı için araştırma doğrudan Google ve Ollama belgelerinden yapıldı. Hugging Face raw model kartı isteği yetki gerektirdi (401); erişim koşulları atlanmadı, ağırlık indirilmedi ve lisans kabul edilmedi.

## 2. Bu makinede görülen donanım

- Linux x86_64, 20 mantıksal CPU.
- Yaklaşık **32 GB RAM**.
- **NVIDIA GeForce RTX 4060 Laptop GPU**, **8 GB VRAM**; inceleme anında yaklaşık 7 GB boş.
- İlk incelemede Ollama servisine bağlantı kurulamadı; daha sonra kullanıcı modelden yanıt aldı. Sonraki kontrolde Ollama 0.40.16 ve Q4_K_M / 4.3B model görüldü; EndeavourOS üzerinde `ollama-cuda` paketi bulunamadı.
- Python ve uv mevcut; Docker bulunamadı. Bu hazırlık Docker gerektirmez.

Salt ağırlık belleği için yaklaşık alt sınırlar: 4B × BF16 ≈ 8 GB; 4B × 4-bit ≈ 2 GB; 27B × 4-bit ≈ 13,5 GB. Bunlar **çalıştırma gereksinimi değil**: quantization metadata, görüntü kodlayıcısı, KV cache, bağlam ve çalışma tamponları ek bellek ister. Tam BF16 4B modeli 8 GB VRAM'e rahatça sığacak diye varsaymayın. 27B'nin tamamı bu GPU'ya sığmaz; CPU offload mümkün olsa da gecikme/bellek ayrıca ölçülmeli.

İlk deneme için kısa bağlam, tek eşzamanlı istek ve kuantize 4B önerilir. Kullanıcının yanıtı üretimin çalıştığını gösterir; paylaşılan `ollama ps` sonucu CPU kullanımını gösteriyordu. GPU hızlandırması ve sistematik kalite/hız değerlendirmesi henüz doğrulanmadı.

## 3. Hazırlanan mimari

```text
Yeni frontend
  → Astrobio: POST /api/ai/explain
  → oturum + rol kontrolü
  → kural motorundan tek bulgu ve kaynakları
  → yalnız loopback Ollama /api/tags + /api/chat
  → deneysel açıklama + değişmemiş orijinal bulgu
```

- Model **alarm seviyesini veya tıbbi eşiği belirlemez**, veritabanını değiştirmez.
- İlk aşama **metin açıklama**dır; serbest tıbbi sohbet, teşhis, ilaç/doz veya görüntü analizi değildir.
- Gönderilen bağlam tek yetkili bulgu, veri yaşı ve kaynaklarıdır. İsim, diğer mürettebat, not, mesaj ve görsel ek gönderilmez. Kullanıcıdan serbest prompt veya sunucu adresi kabul edilmez.
- Kırmızı ve eski (`stale`) bulgular için model çağrılmaz; orijinal veri hemen döner.
- Model kapalıysa, kurulu değilse, meşgulse veya yanıt vermezse orijinal bulgu korunur. **Gemini/bulut fallback yoktur.** Önceden var olan `/api/reword` ayrı ve açıkça bulut özelliğidir; tamamen yerel kullanım için `GEMINI_API_KEY` boş kalmalı.
- Aynı API sürecinde tek üretim; kullanıcı başına dakikada 6 explain isteği; en fazla 256 çıktı tokenı, 4096 bağlam, varsayılan 90 saniye timeout.
- Yalnız `http://127.0.0.1:<port>` veya `http://[::1]:<port>` kabul edilir; redirect takip edilmez. `localhost` DNS tabanlı olduğu için bilerek kabul edilmez.
- Modelin Ollama envanterindeki `remote_host`/`remote_model` alanları doluysa çağrı reddedilir; cloud etiketleri de reddedilir. Ollama'yı ayrıca `OLLAMA_NO_CLOUD=1` ile başlatın. Güvenilmeyen/değiştirilmiş runtime'a karşı bunun tek başına bir güvenlik garantisi olmadığını unutmayın.

Kod: `server/localAi.ts`. Model durumunu sorgulama: `scripts/check-local-ai.ts`. Kurulum: `scripts/setup-local-ai.ts` ve `scripts/local-ai-setup.ts`. Yeni npm veya Python çalışma zamanı bağımlılığı eklenmez.

## 4. Elle kurulum alternatifi — özel checkpoint/GGUF için

### A. Model ve koşullar

1. Resmi checkpoint veya doğrulanmış türevi seçin. [HAI-DEF koşullarını](https://developers.google.com/health-ai-developer-foundations/terms) ve erişim/lisans gerekliliklerini kendiniz inceleyip kabul edin.
2. GGUF kullanacaksanız kaynak checkpoint/revision, dönüştürücü sürümü, quantization türü, tokenizer/chat template, indirme kaynağı ve SHA256 kaydedilmeli. Topluluk GGUF'leri Google'ın resmi dağıtımı gibi sunulmamalı.
3. İndirme/erişim için gerekiyorsa Hugging Face hesabıyla kendi makinenizde giriş yapın; tokenı git'e veya istemciye koymayın. Resmi model kartındaki Transformers yolu doğrudan checkpoint kullanımı için alternatiftir. Bu hazırlık bir Python/Transformers sunucusu kurmaz.
4. MedGemma ağırlıkları proje kodunun GPL lisansına otomatik olarak dahil olmaz; ayrı HAI-DEF koşulları geçerlidir. İndirme/dağıtım koşulları kod lisansından ayrıca incelenmeli.

### B. Ollama'yı yalnız yerel çalıştırma

Henüz çalışan Ollama yoksa ayrı terminalde:

```bash
OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 ollama serve
```

Bu ayarlar bu komutla başlatılan sürece aittir. Ollama başka bir sistem servisiyle çalışıyorsa aynı ayarları o servise uygulayıp yeniden başlatmanız gerekir. Astrobio `.env` dosyası Ollama sürecini yapılandırmaz.

### C. Seçilmiş ve doğrulanmış GGUF'i içeri aktarma

Bu adım için uyumlu ağırlık dosyası önceden edinilmiş olmalıdır. Örnek dosya bilerek çalıştırılabilir gerçek bir model yolu içermez:

```bash
cp local-ai/Modelfile.example local-ai/Modelfile
# Modelfile içindeki FROM yolunu doğrulanmış GGUF dosyanızla değiştirin.
ollama create astrobio-medgemma -f local-ai/Modelfile
ollama list
ollama show astrobio-medgemma --modelfile
```

`astrobio-medgemma` **sizin oluşturduğunuz yerel takma addır**, resmi bir kayıt adı değildir. Modelin doğru chat template ile çalıştığını ayrıca sınayın. Her MedGemma checkpoint'i veya GGUF dönüşümünün her Ollama sürümünde çalışacağı garanti edilmez. Multimodal çalıştırma için ek görsel projector/runtime desteği gerekebilir; bu sürümde görsel girişi yoktur.

### D. Astrobio'yu etkinleştirme

Mevcut `.env` dosyanızın diğer değerlerini koruyarak şu ayarları ekleyin:

```env
LOCAL_AI_ENABLED=true
LOCAL_AI_URL=http://127.0.0.1:11434
LOCAL_AI_MODEL=astrobio-medgemma
LOCAL_AI_TIMEOUT_MS=90000
```

```bash
npm run ai:check
npm run dev
```

`ai:check` yalnız servis envanterini/yerel aliası kontrol eder, model indirmez veya inference yapmaz. `ready` sonucu modelin yüklendiği, gerçekten MedGemma olduğu veya doğru yanıt verdiği anlamına gelmez. Model digest ve kökeni ayrıca doğrulanmalı. Hazır değilse komut hata çıkış kodu verir. `.env` değişikliği için çalışan API'yi yeniden başlatın.

## 5. API kullanımı

Önce `/api/login` ile giriş yapın. Ardından:

```bash
curl http://127.0.0.1:8787/api/ai/status \
  -H 'Authorization: Bearer TOKEN_BURAYA'

curl -X POST http://127.0.0.1:8787/api/ai/explain \
  -H 'Authorization: Bearer TOKEN_BURAYA' \
  -H 'Content-Type: application/json' \
  -d '{"crewId":"C1","findingId":"vitals","day":60,"mission":"mars","language":"tr"}'
```

`GET /api/ai/status`: `{state,enabled,runtime:"ollama",model}`.

`POST /api/ai/explain`:

- `crewId`: yetkili mürettebat kimliği veya `cabin`.
- `findingId`: assessment içindeki uzay kuralı bulgu kimliği.
- `day`: 1–90; `mission`: varsayılan `mars`; `language`: `tr` veya `en`, varsayılan `en`.
- Dönen alanlar: `state`, `original:{finding,provenance,sources}`, `generated:string|null`, `experimental:true`, `disclaimer`; başarılı üretimde `model`.
- Mürettebat yalnız kendi/kabin, CMO ekip/kabin bulgularını açıklatır. Dünya rolüne 403; henüz gönderilmemiş sağlık verileri açılmaz.
- Fallback de HTTP 200 dönebilir: `generated` alanını ve `state` değerini kontrol edin; bunu model başarısı diye göstermeyin.
- Durumlar: `generated`, `disabled`, `not_configured`, `invalid_configuration`, `unavailable`, `model_missing`, `remote_model_rejected`, `busy`, `timeout`, `rejected`, `urgent`, `stale`. Durum endpointinde hazır alias `ready` olarak görünür.

## 6. Güvenlik ve değerlendirme

Sistem yönergesi yeni bilgi/ilaç üretmemeyi ister; bu bir garanti değildir. Eklenen sayı kontrolü bazı yeni sayı hatalarını yakalar, ancak yanlış birim, negasyon, bağlam, yeni teşhis veya ilaç adını tamamen engellemez. Dönen metin her zaman deneysel taslaktır ve bağımsız inceleme gerekir. Türkçe istenebilir, fakat Türkçe tıbbi güvenlik/kalite ölçümü henüz yapılmamıştır.

Testler Ollama protokolünü taklit eder; gerçek MedGemma başarısını veya GPU çalışmasını ölçmez. Sıradaki işler:

1. **Işıkhan:** kesin checkpoint/türev, lisans ve digest onayı; prompt/template ve Türkçe/İngilizce değerlendirme kümesi.
2. **Muhammet:** yerel runtime ayarları, zaman aşımı ve kaynak tüketimi ölçümü; bağlantı sınırlarının incelenmesi.
3. **Zehra:** sayı/birim/uyarı korunması, yanlış güven verme, prompt injection, yetki ve servis kesilmesi senaryoları; uzman inceleme süreci.
4. **Elif:** özgün bulguyu ve kaynakları AI metninin yanında gösterme; fallback, bekleme, iptal ve deneysel etiketler. İstemci timeout'u sunucu timeout'undan uzun olmalı.

Model servisinin log/telemetri ayarlarını ve ağ çıkışını da kontrol edin. Model kodu veya ağırlık kaynağı güvenilir değilse loopback bağlantısı verinin dışarı çıkmayacağını tek başına garanti etmez. Bu modül prompt/çıktı kaydetmez; bağımsız runtime'ın davranışı ayrıca denetlenmelidir.

## 7. Birincil kaynaklar

- [Google MedGemma kataloğu](https://developers.google.com/health-ai-developer-foundations/medgemma)
- [MedGemma 1.5 model kartı](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card)
- [Google yerel çalıştırma rehberi](https://developers.google.com/health-ai-developer-foundations/medgemma/get-started)
- [HAI-DEF koşulları](https://developers.google.com/health-ai-developer-foundations/terms)
- [Ollama model içeri aktarma](https://docs.ollama.com/import)
- [Ollama Chat API](https://docs.ollama.com/api/chat)
- [Ollama model envanteri ve remote alanları](https://docs.ollama.com/api/tags)
- [Ollama FAQ: yerel çalışma ve cloud kapatma](https://docs.ollama.com/faq)
