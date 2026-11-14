# Astrobio kalite ve kabul kontrolü

Sorumlu: **Zehra Kaygısız**. Bu belge teknik durum kaydıdır; klinik onay değildir.

## Güncel kapsam

Astrobio artık yalnız backend ve UI'dan bağımsız alan mantığı içerir. Eski ekranlar, tarayıcı demo arka ucu, stiller, 3D modeller ve frontend derleme araçları kaldırılmıştır. Yeni frontend sıfırdan geliştirilecektir; mevcut API rotaları ve SQLite dosyası korunur.

Korunan iyileştirmeler: rol kontrollü sağlık değerlendirmesi, mesaj/acil durum gizliliği, Dünya yanıtlarında alıcı, 16.000 karakter rapor sınırı, muhafazakâr düşük WBC incelemesi, CO₂ açıklama düzeltmesi, UTF-8 güvenli gövde okuma, giriş hız sınırı ve 12 saatlik oturum ömrü.

Gemini yeniden ifade etme servisi `server/reword.js` altına taşındı; bağımsız Vercel giriş noktası kaldırıldı. `/api/reword` Node oturumu gerektirir.

## Otomatik kontroller

```bash
npm ci
npm test
npm run build
npm audit
```

`build` yalnız Node odaklı TypeScript kontrolüdür; web paketi üretmez. Testler Node ortamında çalışır. Tarayıcı demo testleri yerine aynı gizlilik kuralları doğrudan alan fonksiyonlarında ve gerçek HTTP API'sinde sınanır. Test veritabanları ayrı geçici dizinde oluşturulup temizlenir; mevcut `data/crew-health.sqlite` kullanılmaz.

Astrobio geçiş doğrulaması: **47 test başarılı**, TypeScript kontrolü başarılı, `npm audit` **0 açık** bildirdi. Belge bağlantıları ve frontend dosyalarının kaldırılması kontrol edildi; mevcut SQLite dosyasının SHA256 değeri değişmedi. Klinik doğrulama veya yeni frontend için tarayıcı testi yapılmadı.

## Backend kabul listesi

- [ ] `npm run dev` yalnız Astrobio API'yi başlatıyor; dosya değişikliğinde yeniden yükleniyor.
- [ ] `/api/health` çalışıyor; kök adresten HTML beklenmiyor.
- [ ] Mürettebat kendi check-in'ini okuyup yazabiliyor; diğer kişinin verisine erişemiyor.
- [ ] CMO bütün ekip değerlendirmelerini görebiliyor.
- [ ] Dünya, gecikme dolmadan gemi raporunu göremiyor ve check-in API'sine erişemiyor.
- [ ] Dünya yanıtı yalnız alıcıya ve teslim sonrası CMO'ya görünüyor.
- [ ] Acil durum kayıtları/etkinlikleri ilgisiz kullanıcıda görünmüyor.
- [ ] Üç görev ortamı, ilk/son gün ve iki kural modu sınanıyor.
- [ ] Gemini anahtarı olmadan API çalışıyor; yeniden ifade etme kapalı.
- [ ] Mevcut veritabanı ve kullanıcı `.env` dosyası değişmeden korunuyor.

## Yeni frontend için sonraki kabul işleri

UI henüz yoktur. Elif'in geliştireceği arayüzde başarısız kayıtta formun korunması, alıcı seçimi, bağlantı hataları, responsive düzen, klavye/ekran okuyucu, simülasyon ve kaynak etiketleri uçtan uca test edilmelidir. Bu sürümün Node testleri bunların yerine geçmez.

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
