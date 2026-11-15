# Astrobio: iki model ve sesli iletişim

Bu sürüm **bir hazırlık/pilot altyapısıdır**. Genel sohbet modeli kullanıcı tarafından **Qwen3 1.7B (`qwen3:1.7b`)** olarak seçildi. Ses katmanı yerel faster-whisper/Piper kullanır. Model ağırlıkları ve Python bağımlılıkları **açıkça çalıştırılan kurulum komutunda onayla** hazırlanır; normal API başlangıcı veya `npm ci` bunları indirmez. Gerçek Qwen3 kalite/performans ve mikrofon uçtan uca doğrulaması henüz yapılmadı.

## 1. Akış ve güvenlik sınırı

```text
Bas-konuş mikrofonu → yerel STT → kullanıcı transkripti görür/düzeltir/onaylar
                                            ↓
                                        /api/chat
                 ┌──────────────────────────┼────────────────────────────┐
             Acil işaret            Sağlık sorusu / bulgu             Genel sohbet
          Şablon, model bekleme            MedGemma                  Qwen3 1.7B
                                            ↓
                              Yapılandırılmış uzman paketi
                                            ↓
                            Konuşma modeli: empatik giriş seçimi
                                            ↓
                          Sunucu: değişmeyen bulgu + kaynak + uyarı
                                            ↓
                         kullanıcıya metin + kısa ömürlü replyId
                                            ↓
                               yerel TTS → sesli oynatma
```

### İki modelin görevleri

- **Kural motoru:** Sayılar, alarm seviyesi, açıklama, sonraki adım ve kaynaklar için kanonik veri. AI bunları değiştiremez.
- **MedGemma:** Sağlıkla ilgili serbest mesaj doğrudan modele gönderilir; bulgu seçimi şart değildir. Kişisel kayıtlar/notlar/görseller otomatik eklenmez. Genel sağlık eğitimi metni üretebilir; güncel kişisel ölçüm veya tanı uydurmaması istenir. Bu prompt doğruluk garantisi değildir. Eski `findingId` yolunda kanonik bulgu açıklaması ayrıca korunur.
- **Konuşma modeli:** Sağlık akışında kanonik paket ve açıkça deneysel uzman taslağını alır, yalnız `acknowledge`, `calm`, `thanks` anahtarlarından birini seçer. Sunucu önceden tanımlı empatik girişi ekler. **Bu ilk sürümde tıbbi metni serbestçe yeniden yazamaz.**
- **Genel sohbet:** Sadece selamlama listesiyle sınırlı değildir; kullanıcı mesajı doğrudan Qwen3'e gider. Modelin doğal ve empatik konuşması, insan/doktor olduğunu iddia etmemesi istenir. Sağlık sözcükleri rol seçimi içindir; eşleşmeyen mesaj da modele gider, `needs_context` ile reddedilmez. Yanlış sınıflandırma mümkündür; Qwen prompt'u da tıbbi sınırları korumasını ister.
- Acil belirti/kendine zarar ifadeleri ve seçili kişide kırmızı bulgu model beklemeden uyarıya gider. Bu kelime kuralları **klinik triyaj sistemi değildir**; eksik/yanlış eşleşebilir.
- Kırmızı/eski bulgu için iki model de atlanır. Klinik belirsizlik ve `demo`/`partial` kaynak durumları korunur. Özgün sağlık alanları İngilizce kalabilir; doğrulanmış Türkçe klinik çeviri henüz yoktur.
- Modeller aynı anda üretim yapmaz; ortak süreç içi slot kullanılır. İki-model akışı `keep_alive: 0` ile modellerin sırayla boşaltılmasını ister. Diğer Ollama istemcilerini/süreçlerini bu uygulama kontrol etmez; GPU belleği ve toplam gecikme ayrıca ölçülmeli.

İki model kullanmak klinik doğruluk garantisi vermez. Bulgu olmadan verilen sağlık yanıtı **AI tarafından üretilmiş genel eğitim bilgisidir**, kanonik ölçüm değerlendirmesi değildir. TTS son `reply` metnini, bu durumda deneysel sağlık yanıtı ve uyarısıyla birlikte okur. `think:false` kullanılır; Qwen reasoning alanı gösterilmez. Modeller offline/kapalı/eksikse sahte sohbet cevabı yerine servis durumu açıklanır.

### Nihai yanıt ve sohbet dili

İçe aktarılmış MedGemma şablonları system mesajını atlayabildiği için çıktı sözleşmesi medikal user turn içinde de tekrarlanır; mevcut model/şablon değiştirilmez. Medikal üretim yalnız tek `reply` alanlı JSON olarak kabul edilir. `<unused94>`/`<think>` gibi token'lar, tanınan Draft/Critique/Revise başlıkları ve token sınırında kesilmiş metin reddedilir; ham taslak kullanıcıya, Qwen'e veya TTS'ye aktarılmaz. Kontrol sezgiseldir; işaretsiz tüm akıl yürütme veya tıbbi hata türlerini yakalama garantisi yoktur.

Arayüz İngilizce kalır; sohbet dili Auto/English/Turkish ile seçilebilir. Auto mesaj metninden dil sezgisi kullanır, belirsiz mesajda son tespit edilen dili korur. Giriş/uyarı/servis metinleri de istek diliyle eşleşir. Mikrofon transkripsiyonu için dil açıkça seçilebilir. Önceki sohbet mesajları hâlâ sunucuya otomatik eklenmez.

### Yetkili veritabanı kayıtlarının açıklanması

Kullanıcı sağlık verilerini/kayıtlarını değerlendirmeyi istediğinde `server/healthContext.ts`, yalnız seçili yetkili kişi ve görev günü için bağlam hazırlar. O günkü kaydedilmiş check-in varsa gerçek kayıt değerleri; yoksa açıkça etiketlenmiş simüle sensör akışı kullanılır. Baz çizgi, bütün bulguların seviyesi/ölçümü, üç öncelikli bulgunun ayrıntıları, kaynak/güncellik bilgisi ve en fazla yedi eski check-in'in vital/uyku/kütle/baş ağrısı özeti eklenir. İsim, görüntü, serbest not, mesaj, diğer kişiler ve gelecekteki kayıtlar eklenmez. Genel sohbet/yalnız eğitim sorusu bu paketi almaz.

MedGemma'nın kayıt açıklaması yalnız tamamlanmışsa ve kaynakta/mesajda bulunmayan sayılar üretmemişse yardımcı bağlam olarak kullanılabilir. Bu kontrol her tıbbi yanlış yorumu yakalayamaz. Bu nedenle Qwen'in kayıt akışında serbest tıbbi yorum yazmasına izin verilmez: yalnız onaylı giriş anahtarı ve mevcut bulgu ID'leri seçer. Sunucu değişmeyen sayıları, ölçüm tarihini, kaynak durumunu ve kural seviyelerini render eder; işaretli/eski bulguları önceliklendirir. Önceki iki kayıt karşılaştırması sunucuda hesaplanır ve klinik trend sayılmaz. Model seçimi doğrulanamıyorsa açıkça model dışı kayıt/kural özeti gösterilir. Bu akış genel eğitim yanıtlarını veya acil uyarı önceliğini kaldırmaz.

## 2. Qwen3 1.7B kurulumu

Mevcut MedGemma kurulumu aynı şekilde kalır. İkinci model için:

```bash
npm run setup:companion
# Koşulları önceden incelediyseniz etkileşimsiz:
npm run setup:companion -- --yes
```

Varsayılan rol modeli `qwen3:1.7b`'dir. [Ollama kartı](https://ollama.com/library/qwen3:1.7b) yaklaşık 1.4 GB Q4_K_M dosyası ve Apache-2.0 lisansı listeler; indirme sürümü/digest'i kurulumda ayrıca kilitlenir. Mevcut özel `COMPANION_AI_MODEL` korunur. Bilinçli değiştirmek için `--model qwen3:1.7b`; mevcut kilit farklıysa ayrıca `--update-lock` gerekir. Ayrı `COMPANION_AI_*` ve `local-ai/companion-model-lock.json` kullanılır; MedGemma ayarları/kilidi değiştirilmez. Bu kısayol ses kurulumunu atlar.

Tam `setup:local-ai` varsayılan olarak medical → companion → voice aşamalarını çalıştırır. `--role medical` / `--role companion` tek dil modeli rolünü seçer; `--skip-voice` sesi atlar. `--model` ve `--update-lock`, `--role` yoksa yalnız medical aşamasına uygulanır. Başarılı bir aşama sonraki aşama hatasında geri alınmaz; companion aşamasını bağımsız tekrar deneyebilirsiniz. Kurulum sonrası çalışan API'yi yeniden başlatın.

```env
COMPANION_AI_ENABLED=true
COMPANION_AI_URL=http://127.0.0.1:11434
COMPANION_AI_MODEL=qwen3:1.7b
COMPANION_AI_TIMEOUT_MS=90000
```

Genel sohbet düz metin, sağlık giriş seçimi JSON şemalı çıktıdır. Şema hatasında medikal metin korunur; genel sohbet/medikal model çalışmıyorsa servis hatası açıkça gösterilir. Hiçbir akışta bulut fallback yoktur. Sohbet stateless olduğundan önceki mesajlar yeni isteğe gönderilmez. Gerçek çok turlu bağlam ayrı bir geliştirmedir.

## 3. Otomatik ses kurulumu ve yerel servis

Ana kurulum ses bileşenlerini de varsayılan içerir:

```bash
npm run setup:local-ai
```

MedGemma zaten hazırsa yalnız ses bileşenleri kurulabilir; bu komutta Ollama gerekmez:

```bash
npm run setup:voice
```

Etkileşimsiz ve koşulları önceden incelenmiş kullanım:

```bash
npm run setup:local-ai -- --yes --accept-voice-license
# veya yalnız ses:
npm run setup:voice -- --yes --accept-voice-license
```

`--yes` genel kurulum onayıdır; ses lisansı için ayrı `--accept-voice-license` gerekir. Etkileşimli kurulumda koşullar ayrıca sorulur; ret halinde indirme başlamaz. Ses istemeyen kullanım için `--skip-voice` verin. Sistem sürücüsü/yönetici komutu çalıştırılmaz.

### Betiğin hazırladığı bileşenler

1. `tools/voice/.venv` altında Python 3.11/3.12. Kurulu uygun Python yoksa **mevcut uv** ile 3.11 indirilebilir. İkisi de yoksa talimatla durur. Özel `VOICE_PYTHON` korunur; bulunamıyorsa başka ortamla değiştirilmez. Sistem Python’una pip kurulmaz.
2. Venv içinde faster-whisper, Piper ve Hugging Face Hub paketleri. Alt işlemlere ilgisiz uygulama API anahtarları/HF tokenları aktarılmaz.
3. Yeni kurulum varsayılanı: multilingual `Systran/faster-whisper-small` ve Piper `tr_TR-dfki-medium`. Genel depolar token gönderilmeden, immutable commit revizyonuyla `tools/voice/models/` altına indirilir. Ses kartında **CC BY-NC-SA 4.0 veri koşulu** var; ticari kullanıma uygun varsaymayın. Kullanımınıza uygun özel ses dosyasını önceden `TTS_MODEL_PATH` ile seçebilirsiniz.
4. Mikrofon/hasta verisi olmadan Türkçe bir cümle sentezlenir ve STT ile okunur. Bu, bağlantı ve temel üretim testidir; metin doğruluğu veya klinik telaffuz onayı değildir. Başarısızsa yeni ses ayarları etkinleştirilmez.
5. Başarıda ses alanları `.env` içine yazılır; mevcut dosya özel izinli yedeklenir. API/MedGemma/companion/Gemini değerleri korunur. Varsayılan adres `http://127.0.0.1:8001`, `VOICE_ENABLED=true` hazırlanır.

Ana kurulum dil modelini kaydettikten sonra ses aşamasına geçer. Ses başarısız olursa dil modeli kurulmuş olabilir; sesi `npm run setup:voice` ile yeniden deneyin. Kurulmuş paketler ve kısmi indirme önbelleği korunur. Alt işlemlerde 30 dakikalık sınır vardır; ağ/donanım süresi değişir.

Ayar dosyaları dosya başına atomik yazılır; `.env` ile ses manifesti tek bir dosya sistemi işlemi değildir. Kabukta export edilmiş ortam değişkenleri Node'un `.env` değerlerini maskeleyebilir; çakışan `VOICE_*` exportlarını kontrol edin.

### Ses kilidi ve dosya koruması

İlk başarılı kurulum `local-ai/voice-model-lock.json` içine model repo revizyonlarını ve dosyaların SHA256 değerlerini yazar. Ağırlıkları değil, incelenmiş küçük manifesti Git'e ekleyin. Sonraki clone'lar kilitli revizyonları kullanır; geçerli dosyalar yeniden indirilmez. Python paketleri hâlâ requirements aralıklarıyla çözümlenir; üretim için ayrı pip sürüm/hash kilidi gerekir.

Mevcut özel yerel modeller değiştirilmez. Kilitsiz ama tam dosyalar, uzak kökeni doğrulanmış gibi gösterilmeden `repo:null` checksum kaydıyla benimsenir; bunlar clone sonrası otomatik indirilemez, aynı yerel dosyalar ayrıca sağlanmalıdır. Kısmi kilitsiz dosyalarda/checksum farkında durulur. İnceleme sonrası **yönetilen dosyaları yeniden indirmeye de izin veren** güncelleme:

```bash
npm run setup:voice -- --update-voice-lock
```

Özel model yollarında bu seçenek uzaktan dosya değiştirmez; mevcut dosyaların yeni checksum'unu kabul eder. Özelleştirilmiş STT/TTS URL'leri de sessizce yerleşik servise çevrilmez; adresleri `VOICE_PORT` ile bilinçli eşleştirin veya aşağıdaki manuel yolu kullanın.

### Kurulum sonrası çalıştırma

Kurulum kalıcı servis açmaz. Ayrı terminalde `npm run voice:server`, ardından başka terminalde `npm run dev` çalıştırın. Mikrofon yetkisi kurulumda istenmez; yalnız frontend kayıt butonuyla alınır.

### Servis özellikleri

Node backend'e yeni npm çalışma zamanı bağımlılığı eklenmedi. İsteğe bağlı Python servisi:

- **STT:** faster-whisper, yerel CTranslate2 model dizini, CPU/int8.
- **TTS:** Piper, yerel `.onnx` ve bitişiğindeki `.onnx.json`, CPU.
- GPU dil modellerine bırakılır. Sesler klonlanmaz; önceden edinilmiş tek ses seçilir.
- Servis yalnız `127.0.0.1` üzerinde dinler ve tek iş işler. Kendi başına kullanıcı kimliği sağlamaz; **doğrudan internete veya frontend'e açmayın**. İstemci yalnız oturum kontrollü Astrobio API'sini kullanmalı.
- Ses servisinin **çalışma zamanında** otomatik ağırlık/tokenizer indirmesi kapalıdır; indirme yalnız onaylı kurulumda yapılır. Model dosyalarının kökenini, checksum'unu ve ayrı lisansını doğrulayın.

### Gelişmiş: elle ortam/model yolu seçimi

Python 3.11 veya 3.12 sanal ortamı önerilir. İşletim sisteminizdeki Python ile uyumlu wheel bulunmasını doğrulayın. Örneğin:

```bash
python3 -m venv tools/voice/.venv
tools/voice/.venv/bin/python -m pip install -r tools/voice/requirements.txt
```

Windows'ta sanal ortamın `Scripts/python.exe` yolunu kullanın. `requirements.txt` sınırlı sürüm aralıkları içerir; üretim için çözümlenmiş sürümler/hash'ler ayrıca kilitlenmelidir. Bu bağımlılıklar Node `npm audit` kapsamına girmez.

Whisper CTranslate2 dizininde ağırlıklar ve `tokenizer.json` yerel bulunmalıdır. Türkçe için multilingual model gerekir; `.en` modellerini seçmeyin. Piper sesini kendi model kartından dil ve kullanım koşullarına göre seçin.

**Lisans uyarısı:** İncelenen Türkçe `tr_TR/dfki/medium` kartı veri lisansı olarak **CC BY-NC-SA 4.0** belirtir. Bu sesi otomatik indirme veya ticari kullanım için varsayılan yapmadık. Piper motorunun GPL lisansı ile ses ağırlıklarının/verisinin koşulları farklıdır.

`.env` içine gerçek yerel yollarınızı ekleyin; aşağıdaki adlar **servis aliaslarıdır**, ağırlık indirme kimlikleri değildir:

```env
VOICE_ENABLED=true
VOICE_STT_URL=http://127.0.0.1:8001
VOICE_STT_MODEL=local-whisper
VOICE_TTS_URL=http://127.0.0.1:8001
VOICE_TTS_MODEL=local-piper
VOICE_TTS_VOICE=selected-voice
VOICE_TIMEOUT_MS=60000
VOICE_PYTHON=tools/voice/.venv/bin/python
STT_MODEL_DIR=tools/voice/models/whisper-model
TTS_MODEL_PATH=tools/voice/models/selected-voice.onnx
```

Son dosyanın yanında `selected-voice.onnx.json` da gerekir. Bu yollar şablondur, hazır dosyalar değildir. `.env` mevcut ayarlarını koruyun. Sanal ortam ve ağırlık dizini Git tarafından yok sayılır.

Bir terminalde:

```bash
npm run voice:server
```

Başka terminalde `npm run dev`. `voice:server` yalnız açıkça çalıştırıldığında ön planda servis başlatır; kurulum/indirme yapmaz. Eksik yol veya bağımlılıkta başarısız olur. Ses motoruna bağlı olarak ilk yükleme yavaş olabilir. Model/voice diliyle hedef dilin uyuşması ve sayı/birim telaffuzu ayrıca test edilmelidir.

## 4. API sözleşmesi

Tüm endpointler `Authorization: Bearer ...` gerektirir.

### `GET /api/ai/pipeline/status`

`{medical,companion,voice,memory:"stateless"}`. Ollama `ready` envanter kontrolüdür, kalite veya inference garantisi değildir. Ses durumundaki `verified:false`, yalnız yapılandırmanın raporlandığını belirtir.

### `POST /api/chat`

```json
{
  "message": "Ölçümümü birlikte gözden geçirebilir miyiz?",
  "language": "tr",
  "crewId": "C1",
  "findingId": "vitals",
  "day": 60,
  "mission": "mars"
}
```

- Mesaj 1–2000 karakter. Varsayılan dil `tr`, gün 60, görev `mars`, kişi oturum sahibidir.
- Mürettebat kendi/kabin, CMO yetkili ekip/kabin verisi; Dünya rolüne bu pilot chat için 403.
- `findingId` yoksa yalnız dar sosyal kapsam veya bağlam isteme/acil şablonu çalışır. Seçili kişide kırmızı bulgu varsa sosyal sohbetin de önüne geçer.
- Yanıt: `route`, `reply`, `specialist`, `companion`, isteğe bağlı `original`, `experimental:true`, `replyId`, `replyExpiresInSeconds:120`, `persisted:false`.
- Rotalar: `medical`, `social` (genel sohbet dahil), `urgent`; `needs_context` kaldırıldı. Bileşenlerin `state` alanlarını kontrol edin; model hatasını açıklayan servis mesajı HTTP 200 olabilir ve model yanıtı olarak sunulmaz.
- Kalıcı sohbet hafızası, kişilik profili, konuşma geçmişi veya otomatik tanı yoktur. `replyId` yalnız TTS için iki dakika RAM'de metin tutar; kullanıcı başına en fazla 10, toplam 200 kayıt. API yeniden başlarsa kaybolur. `persisted:false`, veritabanına yazılmadığı anlamındadır; RAM'de hiç bulunmadığı anlamında değildir.

### `POST /api/voice/transcribe?language=tr`

```bash
curl -X POST 'http://127.0.0.1:8787/api/voice/transcribe?language=tr' \
  -H 'Authorization: Bearer TOKEN_BURAYA' \
  -H 'X-Voice-Consent: true' \
  -H 'Content-Type: audio/wav' \
  --data-binary @recording.wav
```

Gövde **ham WAV**, multipart değil: mono PCM16, **16000 Hz**, en fazla 30 saniye ve 1.000.000 bayt. WebM/Opus/MP3 kabul edilmez. Dil `tr`/`en`. Yanıt `{text,language,needsConfirmation:true,stored:false}`. Ses veya transkript diske yazılmaz; bu çağrı **otomatik chat çalıştırmaz**. STT sayıları/ilaç adlarını yanlış duyabilir; kullanıcıya gösterip düzeltme/onay alın.

Onaylanan transkripti chat'e gönderirken `inputOrigin:"voice", transcriptConfirmed:true` ekleyin. Onay alanı yok/false ise sunucu reddeder. Sunucu kullanıcı arayüzünün gerçekten onay aldığını kanıtlayamaz; istemci bu akışı uygulamalı.

### `POST /api/voice/speak`

```bash
curl -X POST http://127.0.0.1:8787/api/voice/speak \
  -H 'Authorization: Bearer TOKEN_BURAYA' \
  -H 'X-Voice-Consent: true' \
  -H 'Content-Type: application/json' \
  -d '{"replyId":"CHAT_YANITINDAKI_ID"}' \
  --output reply.wav
```

Keyfi metin değil, yalnız aynı kullanıcının geçerli `replyId` değeri kabul edilir. Yanıt `audio/wav`, `Cache-Control:no-store`; receipt yanlış kullanıcıya aitse veya süresi dolmuşsa 404. TTS yalnız son sunucu yanıtını okur. Ses çıktısı mono PCM16, 8–48 kHz, en fazla 120 saniye / 8 MiB olmalıdır. Python referans servisi Piper'ın doğal örnekleme hızını korur.

Ek hata durumları: 415 yanlış codec, 413 büyük ses, 503 kapalı/eksik yapılandırma, 502 bozuk/ulaşılamayan ses servisi, 429 meşgul/hız sınırı. Ses başlığı `X-Voice-Consent:true` açık uygulama onayıdır; tarayıcı mikrofon izninin veya hukuki veri izninin yerini tutmaz.

## 5. Mikrofon ve oynatma için frontend yardımcısı

`clients/voice-client.js`, framework bağımsız bir tarayıcı örneğidir; yeni arayüzü oluşturmaz. Kendi frontend'inize modül olarak dahil edin ve `/api` proxy'sini yapılandırın. Backend bu dosyayı statik sunmaz.

```js
import { AstrobioVoiceClient } from './voice-client.js';
const voice = new AstrobioVoiceClient(token);

// Kullanıcı izin açıklamasını okuyup ilgili butona bastığında:
voice.grantConsent();
// Ayrı bir bas-konuş butonundan çağırın:
const wav = await voice.record(8);
const transcript = await voice.transcribe(wav, 'tr');
// transcript.text'i ekranda gösterin; kullanıcı düzeltsin/onaylasın.
// Kullanıcı ONAYLA butonuna bastıktan sonra:
const result = await voice.sendConfirmedText(editedTranscript, {
  language: 'tr', crewId: 'C1', findingId: 'vitals', day: 60, mission: 'mars'
});
// reply + original + deneysel etiketleri gösterin.
await voice.speak(result.replyId);
// Durdur/izni geri çek butonları:
voice.stop();
voice.revokeConsent();
```

Örnek adımlar **tek bir otomatik zincir olarak kullanılmamalı**; kayıt ve transkript onayı ayrı kullanıcı etkileşimleridir. Mikrofon yalnız localhost/HTTPS ve tarayıcı izniyle açılır; kayıt sonunda track'ler kapatılır. Yardımcı AudioWorklet ile sınırlı kayıt alır, 16 kHz WAV'e örnekler. Tarayıcı/cihaz kalitesi test edilmedi. Sıkı CSP kullanıyorsanız örnek Blob worklet yerine aynı origin'de statik bir worklet modülü sunun.

Bu sürüm sürekli dinleme, wake-word, WebSocket akışı veya gerçek full-duplex/barge-in değildir. `stop()` istemci kaydını/fetch'i/oynatmayı durdurur; başlamış sunucu/runtime işi anında iptal edilmez. Timeout beklemeyi sınırlar; özellikle Python'daki hesaplama istemci ayrıldıktan sonra da sürebilir. Aynı anda bir kullanıcı etkileşimi çalıştırın; butonları işlem boyunca kilitleyin.

## 6. Testler ve sonraki kabul işleri

```bash
npm test
npm run build
python3 -B -m unittest discover -s tools/voice -p 'test_*.py'
node --check clients/voice-client.js
```

Testler fake Ollama/STT/TTS yanıtları ve stdlib sahte ses motorları kullanır; ağırlık indirmez, gerçek mikrofon açmaz. Python protokol testleri ek bağımlılık istemez. CI'da bu testler de çalışır. Gerçek motor/voice doğruluğu, Türkçe telaffuz, klinik sayı/birim doğruluğu, ikinci model şema uyumu ve toplam gecikme henüz ölçülmedi.

Sıradaki onaylar: konuşma modeli seçimi, ses modeli/voice lisansı, Türkçe değerlendirme kümesi, kriz yönlendirme kapsamı, gerçek mikrofon-oynatma testi, hasta verisi saklama/onay politikası. Bu bir tıbbi cihaz veya insan ilişkilerinin yerine geçen bir sistem değildir.

Kaynaklar: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md), [incelenen Türkçe ses kartı](https://huggingface.co/rhasspy/piper-voices/blob/main/tr/tr_TR/dfki/medium/MODEL_CARD). Bunların koşulları ayrı ayrı incelenmelidir.
