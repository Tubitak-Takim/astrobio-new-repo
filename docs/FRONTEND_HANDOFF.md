# Astrobio: sıfırdan frontend geliştirme

Sorumlu: **Elif Nur Özek**. Backend desteği: **Muhammet Kerim Şahin**. Kabul testleri: **Zehra Kaygısız**.

Eski frontend tamamen kaldırıldı: React ekranları, stiller, 3D modeller, ekran görüntüleri, tarayıcı API adaptörü ve localStorage demo arka ucu artık yok. Yeni framework veya tasarım seçilmedi. Bu depoda frontend geliştirme sunucusu bulunmuyor; `npm run dev` yalnız API'yi başlatır.

## Başlangıç akışı

1. `GET /api/users` ile demo hesaplarını alın.
2. `POST /api/login` çağrısına `{userId,pin}` gönderin; demo PIN `2026`.
3. Sonraki çağrılarda `Authorization: Bearer <token>` kullanın.
4. `/api/state` kayıtları, `/api/assessment?day=60&mission=mars&mode=space` değerlendirme ve kaynakları sağlar.
5. `401` durumunda girişe dönün; `403` için yetki açıklaması, ağ hatasında bağlantı uyarısı gösterin.
6. İsteğe bağlı yerel AI için `/api/ai/status` ve `/api/ai/explain` kullanın. Orijinal bulguyu/uyarıyı koruyun; `generated:null` bir fallback'tir. Kurulum ve yanıt sözleşmesi [yerel AI rehberinde](LOCAL_AI.md).

Kesin sözleşme: [API belgesi](API.md). TypeScript tipleri `src/assessment.ts`, `src/model.ts` ve `src/triage.ts` içindedir; ekranları veya Node sunucu kodunu tarayıcı paketine taşımayın. Kendi HTTP adaptörünüzü yazın. API'nin rol filtresini frontend filtreleriyle değiştirmeyin.

## Geliştirme bağlantısı

Backend varsayılanı `http://127.0.0.1:8787`. Yeni frontend kendi portunda çalışabilir; kendi geliştirme aracında `/api` için bu adrese proxy ekleyin. Backend CORS'u herkese açmaz. Üretimde HTTPS reverse proxy ile aynı origin kullanın.

```js
const response = await fetch('/api/assessment?day=60&mission=mars&mode=space', {
  headers: { Authorization: `Bearer ${token}` },
})
const data = await response.json()
if (!response.ok) throw new Error(data.error)
```

Frontend framework'ü bağımsızdır. API sağlığı tarayıcıda `/api/health` ile kontrol edilebilir; `/` adresinin web sayfası döndürmesi beklenmez. Eski `VITE_BACKEND_MODE` ve `API_PROXY_TARGET` ayarları bu depodan kaldırıldı; otomatik tarayıcı demosuna geçiş yoktur.

## Önerilen ekranlar

- Giriş ve görünür simüle veri uyarısı.
- Kendi sağlık durumu; CMO için ekip görünümü ve ölçüm yaşı.
- Ölçüm detayı: Dünya/uzay sonucu, neden, sonraki adım ve kaynak.
- Ölçüm girişi: doğrulama, bekleme ve hata; başarıdan önce formu kapatmama.
- Dünya iletişimi: gecikmeli raporlar ve Dünya rolünde alıcı seçimi.
- Acil durum eğitim kaydı: adımların kaynağı/demo etiketi.

3D görünüm şart değil; yeni tasarımın kapsamını ekip belirler. Günlük görev/trend hesapları ve el kitabı saf fonksiyon olarak korunmuştur; bunların hepsi için hazır HTTP uç noktası yoktur. Gerekli yeni endpointleri Muhammet ile planlayın; `src/handbook.ts` henüz API'ye bağlı değildir.

## Korunması gerekenler

- Simüle veri, klinik doğrulama eksikliği, demo eşikleri ve kaynak etiketleri.
- Metin/ikon ile durum anlatımı, klavye erişimi, modal odak yönetimi ve responsive tasarım.
- `falseAlarms`/`missed` sayaçlarının klinik başarı değil kural uyuşmazlığı olduğunun açıklaması.
- Eski ölçümün güncel ve normal sağlık durumu gibi gösterilmemesi.
- Gemini kullanılacaksa dış hizmete veri aktarımı için açık açıklama/onay; özgün metnin korunması.
- Görsel ekler backend'de saklanabilir; yeni frontend sıkıştırma/yükleme akışını kendi geliştirmeli. Görsel analiz edilmez veya Dünya'ya raporla gönderilmez.

**Veri modeli sınırı:** Check-in yalnız seçilen günün tüm ölçümlerini değiştirir. Önceki manuel ölçüm sonraki güne taşınmaz. Ölçüm başına bağımsız zaman/kaynak geçmişi sonraki backend işidir.
