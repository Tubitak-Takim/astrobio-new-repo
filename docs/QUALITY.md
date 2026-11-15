# Astrobio kalite ve kabul kontrolü

Sorumlu: **Zehra Kaygısız**. Bu belge teknik durum kaydıdır; klinik onay değildir.

## Güncel kapsam

Astrobio artık sağlanan HTML/CSS/JS frontend'i ve UI'dan bağımsız backend alan mantığını birlikte içerir. Eski React sürümü geri getirilmedi; `frontend/` tasarımı aynı-origin API'ye bağlandı. Mevcut API yetkileri ve SQLite dosyası korunur. Aşağıdaki eski aşama doğrulamaları tarihsel kayıttır.

Korunan iyileştirmeler: rol kontrollü sağlık değerlendirmesi, mesaj/acil durum gizliliği, Dünya yanıtlarında alıcı, 16.000 karakter rapor sınırı, muhafazakâr düşük WBC incelemesi, CO₂ açıklama düzeltmesi, UTF-8 güvenli gövde okuma, giriş hız sınırı ve 12 saatlik oturum ömrü.

Gemini yeniden ifade etme servisi `server/reword.js` altına taşındı; bağımsız Vercel giriş noktası kaldırıldı. `/api/reword` Node oturumu gerektirir.

## Otomatik kontroller

```bash
npm ci
npm test
npm run build
npm audit
```

`build` TypeScript kontrolüdür; frontend doğrudan statik sunulduğundan web paketi üretmez. Alan ve HTTP API testleri Node'da, frontend adaptör/yerleşim testleri happy-dom'da çalışır. Test veritabanları ayrı geçici dizinde oluşturulur; mevcut `data/crew-health.sqlite` kullanılmaz. DOM testleri gerçek tarayıcı görsel/WebGL/mikrofon doğrulamasının yerine geçmez.

Astrobio geçiş doğrulaması: **47 test başarılı**, TypeScript kontrolü başarılı, `npm audit` **0 açık** bildirdi. Belge bağlantıları ve frontend dosyalarının kaldırılması kontrol edildi; mevcut SQLite dosyasının SHA256 değeri değişmedi. Klinik doğrulama veya yeni frontend için tarayıcı testi yapılmadı.

## Yerel AI hazırlığı doğrulaması

Yerel AI eklemesi sonrası **63 test başarılı**, TypeScript kontrolü başarılı, `npm audit` **0 açık** bildirdi. Yeni testler loopback URL kısıtı, cloud alias/remote metadata reddi, kapalı/eksik model, sayı kontrolü, timeout, tek eşzamanlı üretim, yetki izolasyonu ve kırmızı/eski bulguda modelin çağrılmamasını kapsar. HTTP testlerinde ayrı bir Ollama protokol taklidi kullanılır.

`npm run ai:check` mevcut yapılandırmada `disabled` döndü; bu durumda çıkış kodunun 1 olması beklenir. Gerçek model indirilmedi, seçilmedi veya çalıştırılmadı. Prompt ve sayı kontrolü güvenlik/klinik doğruluk garantisi değildir; gerçek model kalite/GPU ölçümü ve Türkçe değerlendirme sonraki aşamadır. Ayrıntılar: [LOCAL_AI.md](LOCAL_AI.md).

Bu paragraf ilk hazırlık anını kaydeder. Kullanıcı daha sonra `medgemma1.5:4b` modelini indirip API yanıtını paylaştı; bu, üretimin çalıştığını gösterir. Sistematik kalite/GPU doğrulamasıyla karıştırılmamalıdır.

## Kurulum aracı doğrulaması

`npm run setup:local-ai` eklemesi sonrası **80 test başarılı**, TypeScript kontrolü başarılı ve bağımlılık taramasında **0 açık**. Testler sahte HTTP yanıtlarıyla model indirme ilerlemesini, hata/eksik üretim davranışını, CPU/GPU/MIXED/UNKNOWN raporunu, digest uyuşmazlığı ve uzak model reddini kapsar. Geçici dizin testleri `.env` değerlerinin/yorumlarının korunmasını, özel izinli yedeği, tekrar çalıştırmayı ve eşzamanlı değişiklikte durmayı doğrular.

Gerçek CLI'nin `--help` yolu ayrıca çalıştırıldı. Kullanıcının gerçek modeline üretim isteği gönderen veya `.env` dosyasını değiştiren tam kurulum burada çalıştırılmadı; indirme/sistem kurulumu yapılmadı. İlk gerçek çalıştırma kullanıcı onayıyla yapılmalıdır. Model kilidi ilk başarılı çalıştırmada oluşur ve inceleme sonrası ekipçe commit edilmelidir.

## İki-model ve ses hazırlığı doğrulaması

- **98 Node testi + 6 Python protokol testi başarılı.** TypeScript kontrolü ve mikrofon yardımcısının JavaScript sözdizimi kontrolü geçti. Node bağımlılık taraması 0 açık bildirdi; opsiyonel Python konuşma paketleri kurulmadığı için bu tarama onları kapsamaz.
- Gerçek HTTP entegrasyon testleri iki modelin sırasını, bulgu yetkisini, acil bypass'ı, ses onayını, transkript onayını ve ses yanıtının kullanıcıya özel olmasını sahte servislerle doğrular.
- İletişim modeli henüz seçilmedi; `COMPANION_AI_MODEL` boş kalır. Kurulumun `--role companion` yolu ayrı ayar/kilit kullanır; mevcut MedGemma kilidini değiştirmeme testi eklendi.
- Sağlık yanıtı konuşma modeline serbestçe yeniden yazdırılmaz. Model yalnız empatik giriş seçer; kanonik sağlık metni sunucuda korunur. Genel sohbet kapsamı bilerek sınırlıdır; kriz kelime kuralları klinik triyaj değildir.
- STT/TTS yalnız sayısal loopback servise bağlanır. Ses dosyaları ve transkript kalıcı saklanmaz; TTS için son yanıt metni kullanıcıya özel, sınırlı ve zamanlayıcıyla temizlenen iki dakikalık RAM receipt'inde tutulur.
- `tools/voice/` CPU faster-whisper/Piper referans servisi, `clients/voice-client.js` AudioWorklet mikrofon/oynatma yardımcısıdır. Model/voice ağırlıkları, Python paketleri indirilmedi; gerçek mikrofon, hoparlör, seçilecek ikinci model ve Türkçe ses doğruluğu uçtan uca denenmedi. Bunlar tamamlanmadan hazır sesli ürün iddiası yapılmamalı.
- İncelenen bir Türkçe Piper ses kartında CC BY-NC-SA kısıtı görüldüğü için o ses varsayılan yapılmadı. Her ses/checkpoint için lisans incelemesi gerekir. Tam kurulum ve kabul işleri: [DUAL_AGENT_VOICE.md](DUAL_AGENT_VOICE.md).

## Otomatik ses kurulumunun ek doğrulaması

Ses ortamı/paket/ağırlık hazırlığı ana kurulum komutuna varsayılan dahil edildi; `setup:voice`, `--skip-voice`, ayrı ses lisansı onayı ve `--update-voice-lock` eklendi. Kurulum mevcut sanal ortamı kontrol eder, uygun Python yoksa mevcut uv üzerinden 3.11 hazırlayabilir, ardından yalnız venv'de paket kurar ve `pip check` çalıştırır. Ağırlık revizyon/checksum manifesti ve sentetik TTS→STT testi başarılı olmadan yeni ses ayarları yazılmaz.

Doğrulama: **110 Node testi ve 14 Python testi başarılı**, TypeScript kontrolü başarılı. İndirme, ortam kurma ve konuşma motorları testlerde taklit edildi. Gerçek `setup:voice --yes` çağrısının ayrı ses lisansı onayı olmadan durduğu doğrulandı; hiçbir gerçek pip/model kurulumu veya kullanıcı `.env` değişikliği yapılmadı. Gerçek ağırlık indirme ve motor uyumluluğu, kullanıcı lisans onayıyla betiği çalıştırdığında ayrıca sınanmalıdır.

Varsayılan Türkçe adayın kartındaki CC BY-NC-SA veri koşulları nedeniyle `--yes` tek başına yeterli değildir. Ticari kullanım/voice seçimi ayrıca incelenmelidir; yeni kurulum otomasyonunun varlığı ses kalitesi veya klinik doğrulama anlamına gelmez.

## Backend kabul listesi

- [ ] `npm run dev` arayüzü ve Astrobio API'yi aynı sunucuda başlatıyor; sunucu dosyası değişikliğinde yeniden yükleniyor.
- [ ] `/api/health` JSON, kök adres `/` arayüz HTML'i döndürüyor.
- [ ] Mürettebat kendi check-in'ini okuyup yazabiliyor; diğer kişinin verisine erişemiyor.
- [ ] CMO bütün ekip değerlendirmelerini görebiliyor.
- [ ] Dünya, gecikme dolmadan gemi raporunu göremiyor ve check-in API'sine erişemiyor.
- [ ] Dünya yanıtı yalnız alıcıya ve teslim sonrası CMO'ya görünüyor.
- [ ] Acil durum kayıtları/etkinlikleri ilgisiz kullanıcıda görünmüyor.
- [ ] Üç görev ortamı, ilk/son gün ve iki kural modu sınanıyor.
- [ ] Gemini anahtarı olmadan API çalışıyor; yeniden ifade etme kapalı.
- [ ] Mevcut veritabanı ve kullanıcı `.env` dosyası değişmeden korunuyor.

## Yeni frontend için sonraki kabul işleri

Yeni arayüz entegredir. DOM testleri giriş, kanonik bulgular, gerçek chat API adaptörü, rapor iletimi, oturum temizliği ve ses onayını kapsar; tüm HTML sayfaları statik HTTP testinden geçer. Elif ve Zehra gerçek tarayıcıda responsive düzen, klavye/ekran okuyucu, WebGL yedeği ve mikrofon/hoparlör akışını ayrıca sınamalıdır. Demo skorlar yetkili sunucu verileriyle karıştırılmamalıdır.

Frontend entegrasyonu doğrulaması (2026-11-15): **121 Node/DOM testi + 14 Python testi başarılı**, TypeScript kontrolü başarılı, npm audit **0 açık**. Kaynak frontend'in 24 dosyasının tamamının aktarımı doğrulandı; PDF/demo JSON/görsel varlıklar korundu ve kullanıcının istediği geçici planlama klasörü kaldırıldı. HTTP testleri gerçek fakat geçici SQLite sunucusunu, AI/ses testleri taklit servisleri kullanır; kullanıcının gerçek modelleri/veritabanı/mikrofonu bu kontrollerde kullanılmadı.

Arayüz düzenlemesi: aktif arayüz İngilizcedir; backend bağlantı paneli yalnız Interactive Health Check içindedir. AI/rapor/profil/not işlevleri kendi sayfalarında korunur. Günlük gösterge sayfalarında panel ve yetkili sağlık verisi isteği bulunmadığı rota bazında sınanır. **134 Node/DOM testi ve TypeScript kontrolü başarılıdır.** İngilizce STT/chat dil istekleri doğrulanır; kurulu ses modeli otomatik değiştirilmez.

Doğrudan mesaj/Qwen3 güncellemesi: **147 Node/DOM testi ve TypeScript kontrolü başarılıdır.** Kullanıcının örnek genel sağlık sorusunun bulgu olmadan MedGemma'ya aynen gitmesi, genel konuşmanın Qwen rolüne gitmesi, acil bypass, çıktı sınırı/reasoning reddi ve ortak üretim kilidi sınanır. Geçici sandbox'ta gerçek kurulum betiği sahte Ollama ile çalıştırılarak medical→companion sırası, yalnız Qwen indirme isteği, ayrı kilitler ve MedGemma ayarlarının korunması doğrulanır. Gerçek Qwen ağırlığı indirilmedi/çalıştırılmadı; klinik doğruluk ve üretim kalitesi doğrulanmış sayılmaz.

Nihai yanıt/dil düzeltmesi: **178 Node/DOM testi ve TypeScript kontrolü başarılıdır.** MedGemma özel düşünme token'ları, Draft/Critique/Revise biçimleri, hatalı/ek alanlı medikal JSON ve `done_reason:length` çıktısının gösterilmemesi sınanır. Auto/English/Turkish seçimi ve Türkçe istek diline uygun giriş/uyarı kontrol edilir. Kullanıcının kurulu MedGemma ve Qwen3 modelleriyle gerçek, sentetik Türkçe uyku ve kurgusal baş ağrısı istemleri ayrıca denendi: iki rol de `generated`, taslak token'ı olmadan nihai yanıt üretti. Bu, klinik güvenilirlik veya kapsamlı ses/GPU doğrulaması değildir; gerçek hasta kaydı/mikrofon verisi kullanılmadı.

Veritabanı bağlamı güncellemesi: **193 Node/DOM testi ve TypeScript kontrolü başarılıdır.** Geçici gerçek SQLite/API testleri seçili kayıt değerlerinin modele aktarılmasını, istemci bağlamının reddini, başka kişilerin/notların/görsellerin dışlanmasını ve yetki sınırlarını doğrular. Birim testleri eski/simüle verinin etiketlenmesini, son yedi kayıt sınırını, kural kaynağını ve sayısal uydurma/serbest Qwen yorumunun engellenmesini kapsar. Gerçek modellerle sentetik kayıtlarda MedGemma sayısal hata/truncation üretebildi; bu yüzden sağlık kayıt özetinde Qwen'in serbest tıbbi metin üretmesi yerine yalnız mevcut bulgu ID'lerini seçmesine izin verildi. Son gerçek denemede geçersiz uzman taslağı gösterilmedi, Qwen seçimi başarılı oldu, yanıt değişmeyen kayıt/kural verilerinden oluşturuldu. Başarılı üretim klinik doğruluk kanıtı değildir.

## Sentetik astronot senaryoları doğrulaması

Otomatik kabin göstergesi ve birleşik CSV/demo aktarımıyla **319 Node/DOM testi ve TypeScript başarılıdır**. UTC ışık eğrisinin sürekliliği/sınırları/vardiya ve kapalı modu, yalnız CMO'nun ortak ayarı değiştirmesi, varsayılan sade arayüz, 90 günlük dört kişilik CSV kapsamı/birimleri/gizliliği, CSV enjeksiyon koruması, gzip/SHA-256, değişmez ve yinelenmeyen paketler, erken Dünya erişiminin/başka mürettebatın engellenmesi ve oturum değişiminde özel dosya indirmeme sınanır. Fiziksel ışık kontrolü veya gerçek Dünya bağlantısı iddia edilmez. [Araştırma, veri kapsamı ve üretim eksikleri](CIRCADIAN_TELEMETRY.md).

Işık/sirkadiyen planlama eklemesiyle **302 Node/DOM testi ve TypeScript kontrolü başarılıdır**. Takvim sınırları/gece yarısı/vardiyalı uyku, rol izolasyonu, yalnız kendi stres öz-bildirimi, kalıcı ayarlar/olaylar, otomatik inceleme önceliği ve idempotensi, yeni sağlık verisinden arka plan değerlendirmesi, yalnız araştırma talebi olan kırmızı ışık akışı, görünür makbuzlar/bağlama uygun bağlantılar, polling temizliği ve gecikmiş yanıt koruması sınanır. Mavi ışık yatma zamanı rahatlatıcı tedavi olarak sunulmaz; kırmızı ışık hücre yenilenmesi iddiası, doz, tedavi onayı veya cihaz kontrolü yoktur. [Kanıt ve sınırlar](LIGHT_PLAN.md). Gerçek tarayıcı ve donanım/klinik kontrolleri ayrıca gereklidir.

Çoklu belirti eklemesiyle **287 Node/DOM testi ve TypeScript kontrolü başarılıdır**. 16 belirti için Türkçe/İngilizce eşleme, çoklu bildirimler, olumsuz/varsayımsal/üçüncü-şahıs dışlama, eski kayıtların korunarak şema geçişi, sayısal ölçüm uydurmama, yetkili kalıcılık/AI bağlamı, acil belirtilerde model atlama ve görünür makbuz/geçmiş/CSV sınanır. Belirti bağlamı hızlı sensör örnekleriyle hemen kaybolmaz. Bunlar tanı veya klinik doğruluk testleri değildir.

Canlı izleme/sohbet öz-bildirimi eklemesiyle **235 Node/DOM testi ve TypeScript kontrolü başarılıdır**. Yeni kapsam: gerçek HTTP ve geçici SQLite ile kalıcı kısmi kayıt, tam check-in/görüntü koruma, kaynak/zaman doğrulama, geç gelen örnek sırası, rol izolasyonu, tutucu Türkçe/İngilizce baş ağrısı çıkarımı, sonraki yetkili bağlam, onaylı ses/acil kural önceliği, görünür makbuz ve demo durdurma/temizleme. [Sunum ve sınırlar](LIVE_MONITORING.md). Gerçek sensör bağlantısı/klinik doğrulama iddia edilmez.

**204 Node/DOM testi ve TypeScript kontrolü başarılıdır.** Dört profil × 90 gün × üç görev için 1.080 okumanın tekrarlanabilirliği ve giriş aralıkları, programlanmış ilişki yönleri, sabit/kısa seride korelasyon üretmeme, ayrı tabloya idempotent ekleme ve manuel kayıtların korunması sınanır. Gerçek geçici SQLite/API testleri rol izolasyonu, gelecekteki günlerin dışlanması ve fotoğraf/not dışlamasını; DOM testleri grafikler, astronot değiştirme, LEO/ISS eşleşmesi ve CSV kapsamını doğrular. Veri üretimi ve katsayılar klinik doğrulama değildir; yeni ekranın gerçek tarayıcı görsel/erişilebilirlik kontrolü ayrıca yapılmalıdır. [Kaynak ve kapsam](SYNTHETIC_CREW_DATA.md).

## Açık işler / üretim engelleri

1. **Ölçüm geçmişi:** kişi+gün tam check-in yerine ölçüm bazlı zaman/kaynak geçmişi; önceki manuel ölçümün sonraki gün geçerliliği.
2. **Klinik inceleme:** kaynak tam metin doğrulaması, CO₂ ortalama zaman pencereleri, radyasyon doz nicelikleri ve alarm seviyeleri.
3. **Gerçek kimlik/veri koruması:** ortak demo PIN'i yerine kimlik sistemi, TLS, disk şifreleme, yedekleme ve veri saklama politikası.
4. **Dağıtım:** sürümlü migration, pagination, ekler için ayrı depolama, idempotency/transaction tasarımı.
5. **Çevrimdışı istemci:** backend kapalıysa uygulama hatası ele alınmalı; eski otomatik tarayıcı demo modu artık yok. Çevrimdışı kuyruk/senkronizasyon henüz geliştirilmedi.
6. **Görev izolasyonu:** anahtarlar kişi+gün içerir, mission içermez; ortam değiştirmek bağımsız kayıt yaratmaz.
7. **Asistan:** İngilizce anahtar kelime eşleşmesi ve yeniden ifade etme için değerlendirme kümesi; el kitabını HTTP'ye bağlama ayrı iştir.
8. **Lisans:** depodaki GNU GPL v3 metni korunur; yeniden kullanılan kod/veri için geçerli dağıtım ve atıf yükümlülükleri kontrol edilmeli.

`PROGRESS.md`, `RESEARCH_LOG.md` ve `CHALLENGE.md` önceki prototiple ilgili tarihsel kayıtlar içerir; eski UI iddiaları Astrobio'nun güncel kapsamını göstermez.
