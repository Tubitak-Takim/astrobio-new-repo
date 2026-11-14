# Kalite, değişiklikler ve kabul kontrolü

Sorumlu: **Zehra Kaygısız**. Bu belge ekip uyarlamasının teknik devridir; klinik onay değildir.

## Bu uyarlamada yapılanlar

- Ekip sorumlulukları ve yeni frontend/backend devir belgeleri eklendi.
- React'tan bağımsız, yetki kontrollü `/api/assessment` uç noktası ve ortak değerlendirme tipi eklendi.
- Mesaj ve acil durum erişim politikaları iki arka uç için ortaklaştırıldı; ilgisiz mürettebata görünürlük kapatıldı.
- Dünya yanıtlarına alıcı desteği eklendi; alıcısız yanıt CMO'ya gider. Referans frontend'e alıcı seçimi eklendi.
- Rapor sınırı 16.000 karaktere çıkarıldı; normal mesaj sınırı 4.000 olarak korundu.
- Yüksek CO₂ için yanlış “sınırın altında” açıklaması düzeltildi.
- Düşük WBC/lenfosit için Dünya laboratuvar alt sınırları muhafazakâr inceleme tetikleyicisi olarak korundu; bunun doğrulanmış uzay eşiği olmadığı açıklandı.
- HTTP gövde okuma bayt bazlı ve UTF-8 güvenli hale getirildi; büyük gövdeler 413 döner ve bellekte büyümeye devam etmez.
- 12 saatlik oturum ömrü, giriş hız sınırı ve yerel yeniden ifade etme oturum kontrolü eklendi.
- Şema eklemelerinde bütün hataları yutmak yerine kolon varlığı kontrol ediliyor.
- Tarayıcı depolaması başarısızken yanlış başarı yanıtı verilmesi düzeltildi.
- Başarısız check-in kaydında formun erken kapanması önlendi; kaydetme sırasında tekrar gönderme kapatıldı.
- Arayüzde karşılaştırma sayaçları klinik doğruluk iddiası yerine kural farklılıkları olarak adlandırıldı.
- Acil durum adımları için ortak doğrulama eklendi.
- Vitest 5'e güncellendi; yeni rol, HTTP ve regresyon testleri ile CI eklendi.
- `.gitignore`, `.env.example`, Node sürüm gereksinimi ve proxy yapılandırması eklendi.

## Otomatik kontroller

```bash
npm ci
npm test
npm run build
npm audit
```

Testler kural motorunu, kaynak referanslarını, rapor boyutlarını, tarayıcı erişim politikasını, giriş/veri doğrulamasını ve gerçek Node HTTP API'sini kapsar. HTTP testleri ayrı geçici veritabanı ve rastgele port kullanır; mevcut `data/crew-health.sqlite` dosyasına dokunmaz.

2026-11-14 doğrulaması: **47 test başarılı**, tip kontrolü/üretim derlemesi başarılı, `npm audit` **0 açık** bildirdi. Derleme referans frontend'deki 500 kB üzeri JavaScript parçaları için performans uyarısı veriyor. Tarayıcı tabanlı uçtan uca testler ve klinik doğrulama yapılmadı.

## Manuel sürüm kabulü

- [ ] Mürettebat kendi check-in'ini kaydediyor; diğer kişinin ölçümünü okuyamıyor/yazamıyor.
- [ ] CMO ekip değerlendirmelerini ve raporları görebiliyor.
- [ ] Dünya, gecikme dolmadan gemi raporunu göremiyor; check-in API'sine erişemiyor.
- [ ] Dünya yanıtı yalnız alıcıya ve teslim sonrası CMO'ya görünüyor.
- [ ] Acil durum kayıtları ilgisiz kullanıcıda görünmüyor.
- [ ] Ağ ve depolama hatasında başarı gösterilmiyor; form içeriği korunuyor.
- [ ] Üç görev ortamı, ilk/son gün ve iki kural modu deneniyor.
- [ ] Mobil, klavye, ekran okuyucu, azaltılmış hareket ve WebGL'siz kullanım kontrol ediliyor.
- [ ] Simülasyon ve kaynak/demo etiketleri yeni tasarımda korunuyor.
- [ ] Gemini kapalıyken temel uygulama çalışıyor; açıkken dış veri aktarımı açıklanıyor.

## Açık işler / üretim engelleri

1. **Ölçüm geçmişi:** günlük tam check-in yerine ölçüm bazlı zaman/kaynak saklama; önceki manuel ölçümün geçerliliği ve eski veri davranışı birlikte tasarlanmalı.
2. **Klinik inceleme:** kaynakların tam metin doğrulaması; CO₂ ortalama zaman pencerelerinin eşleştirilmesi; radyasyon doz niceliklerinin ayrımı ve alarm seviyeleri.
3. **Gerçek kimlik ve veri koruması:** ortak demo PIN'i kaldırılmalı; TLS, disk şifreleme, yedekleme, erişim denetimi ve veri saklama politikası eklenmeli.
4. **Dağıtım:** sürümlü migration, pagination, sağlık verisi eklerinin ayrı depolanması, isteklerin idempotency/transaction tasarımı.
5. **Çevrimdışı çalışma:** PWA/kalıcı önbellek ve güvenilir senkronizasyon kuyruğu yok. `auto` mod ilk kontrol sonucunu sayfa ömrü boyunca tutar; gerçek entegrasyonda `server` modu kullanılmalı.
6. **Görev izolasyonu:** check-in anahtarları kişi+gün içerir, mission içermez. Ortam değiştirmek bağımsız görev kaydı yaratmaz.
7. **Asistan:** İngilizce anahtar kelime eşleşmesi, belirsiz sorular ve yeniden ifade etme tutarlılığı için değerlendirme kümesi gerekli.
8. **Frontend:** özgün tasarım ve uçtan uca tarayıcı testleri henüz yapılmadı; modal odak yönetimi ve hata akışları tarayıcıda doğrulanmalı.
9. **Lisans:** yeniden kullanılan kod ve içerik için izin/atıf incelemesi tamamlanmalı.

Eski `PROGRESS.md` ve `RESEARCH_LOG.md` geçmiş kayıtlarıdır; bazı eski “yapılmadı” notları sonraki oturumlarda tamamlanmıştır. Güncel teknik sınırlar için bu belge ve README esas alınmalıdır.
