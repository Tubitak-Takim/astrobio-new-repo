# Yeni frontend için devir rehberi

Sorumlu: **Elif Nur Özek**. Backend desteği: **Muhammet Kerim Şahin**. Kabul testleri: **Zehra Kaygısız**.

Mevcut arayüz bir referanstır; ekibin yeni tasarımı henüz uygulanmadı. Ekran kodlarını taşımadan backend'i kullanabilirsiniz.

## Önerilen ekranlar

1. **Giriş:** demo hesap seçimi, PIN, simüle veri uyarısı.
2. **Özet:** kendi sağlık durumu; CMO için ekip görünümü; veri yaşı uyarıları.
3. **Ölçüm detayı:** değer, kaynak, ölçüm günü, Dünya/uzay karşılaştırması, gerekçe ve sonraki adım.
4. **Ölçüm girişi:** doğrulama, kaydetme/bekleme/hata durumları; başarısız kayıtta form verisini koruma.
5. **Dünya iletişimi:** rapor, teslim gecikmesi; Dünya rolünde alıcı seçimi.
6. **Acil durum eğitimi:** tıbbi cihaz olmadığı görünür şekilde belirtilmiş adımlar ve kayıt.

3D görünüm isteğe bağlıdır. Önce erişilebilir liste/kart yapısını kurun; model yüklenemediğinde sağlık bilgisine erişim kaybolmamalı. Eski anatomik modelleri taşımak zorunda değilsiniz; kullanırsanız atıflarını koruyun.

## Entegrasyon sırası

- `/users` → `/login` → token → `/state` ve `/assessment`.
- `401` durumunda girişe dönün; `403` için yetki açıklaması, ağ hatasında bağlantı uyarısı gösterin.
- Üretim veya gerçek backend entegrasyonunda `VITE_BACKEND_MODE=server` seçin. `auto` yalnız demo kolaylığıdır; ilk kontrol başarısızsa tarayıcı modunu sayfa ömrü boyunca seçer.
- Geliştirmede `/api` proxy'sini kullanın. Anahtarı veya sağlık verisini `VITE_` ortam değişkenlerine koymayın: bunlar tarayıcı paketine girer.
- Kaydetme yanıtını doğrulamadan modalı kapatmayın veya başarı mesajı göstermeyin.
- Roller için yalnız butonları gizlemek yetmez; sunucudan dönen veri kapsamını temel alın.
- Mevcut `src/api.ts` kullanılabilir; ancak demo arka ucunu da import eder. Bağımsız ve yalnız sunuculu frontend'de küçük bir HTTP adaptörü yazmak daha uygundur.

## Tasarımda korunacak bilgiler

- Simüle veri, klinik doğrulama eksikliği ve demo eşikleri görünür kalmalı.
- Renk tek başına anlam taşımamalı: metin/ikon ve klavye odağı olmalı.
- “False alarm” sayıları doğrulanmış başarı yüzdesi gibi sunulmamalı.
- Eski bir normal ölçüm, güncel ve sağlıklı olunduğu şeklinde gösterilmemeli.
- Gemini seçeneği dış hizmete sağlık metni gönderir. Açık onay ve veri aktarımı açıklaması olmadan sessizce açmayın.
- Responsive ekranlar, modal odak yönetimi ve azaltılmış hareket tercihi test edilmeli.

## Bilinen veri modeli sınırı

Manuel check-in yalnız seçilen günün tüm ölçümlerini değiştirir. Önceki günün manuel ölçümü sonraki güne otomatik taşınmaz; formda önceden dolu ölçümler birlikte yeniden kaydedilir. Frontend bunu “tüm değerler gerçekten bugün yeniden ölçüldü” şeklinde varsaymamalı. Ölçüm bazlı zaman/kaynak geçmişi, backend ile birlikte tasarlanacak sonraki iştir.
