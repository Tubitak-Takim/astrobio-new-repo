# Astrobio: frontend geliştirme ve entegrasyon

Sorumlu: **Elif Nur Özek**. Backend desteği: **Muhammet Kerim Şahin**. Kabul testleri: **Zehra Kaygısız**.

Eski React frontend yerine sağlanan HTML/CSS/JS tasarımı `frontend/` altına entegre edildi. `npm run dev` arayüzü ve API'yi aynı origin'de sunar. Giriş, sağlık değerlendirmesi, check-in, AI/ses, rapor ve sunucu notları `frontend/js/backend.js` içindedir. Orijinal tasarım skorları ve BIS grafikleri ayrı sentetik demo olarak korunmuştur; backend sonuçlarıyla karıştırılmamalıdır. [Güncel frontend rehberi](../frontend/README_PROJE.md).

## Başlangıç akışı

1. `GET /api/users` ile demo hesaplarını alın.
2. `POST /api/login` çağrısına `{userId,pin}` gönderin; demo PIN `2026`.
3. Sonraki çağrılarda `Authorization: Bearer <token>` kullanın.
4. `/api/state` kayıtları, `/api/assessment?day=60&mission=mars&mode=space` değerlendirme ve kaynakları sağlar.
5. `401` durumunda girişe dönün; `403` için yetki açıklaması, ağ hatasında bağlantı uyarısı gösterin.
6. İsteğe bağlı yerel AI için `/api/ai/status` ve `/api/ai/explain` kullanın. Orijinal bulguyu/uyarıyı koruyun; `generated:null` bir fallback'tir. Kurulum ve yanıt sözleşmesi [yerel AI rehberinde](LOCAL_AI.md).
7. İki-model ve ses için `/api/chat` ile `/api/voice/*` uç noktaları ve `clients/voice-client.js` kullanılır. Entegre AI ekranında kayıt izni, transkript onayı ve oynatma ayrı kullanıcı adımlarıdır; otomatik mikrofon açılmaz. [Tam akış ve sınırlamalar](DUAL_AGENT_VOICE.md).

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

Frontend framework bağımsızdır. API sağlığı `/api/health` ile kontrol edilir; `/` artık web arayüzünü döndürür. `server/static.ts` yalnız public frontend dosyalarını ve ses istemcisini sunar; `.env`, SQLite ve model dizinleri erişime kapalıdır. Eski `VITE_BACKEND_MODE` ve `API_PROXY_TARGET` kullanılmaz; API hatasında sessiz demo yanıtına geçilmez.

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
