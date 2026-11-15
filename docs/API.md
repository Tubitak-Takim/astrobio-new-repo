# Astrobio API sözleşmesi

Sorumlu: **Muhammet Kerim Şahin**. Frontend: **Elif Nur Özek**. Entegrasyon doğrulaması: **Zehra Kaygısız**.

Base URL geliştirmede `/api` proxy'si veya `http://127.0.0.1:8787/api`. JSON kullanılır. Giriş dışındaki korumalı çağrılarda `Authorization: Bearer <token>` gönderin. Hatalar `{ "error": "..." }` döner.

## Uç noktalar

| Metot | Yol | Yetki / açıklama |
|---|---|---|
| GET | `/health` | Herkese açık, `{ok:true}` |
| GET | `/users` | Demo hesapları; gerçek kimlik dizini değildir |
| POST | `/login` | `{userId,pin}` → `{token,user}`; oturum 12 saat |
| POST | `/logout` | Mevcut oturumu siler |
| GET | `/state` | Kullanıcının görebileceği kayıtlar |
| GET | `/assessment?day=60&mission=mars&mode=space` | Mürettebat kendi değerlendirmesi + kabin; CMO tüm ekip; Dünya 403 |
| PUT | `/checkins/:crewId/:day` | Mürettebat kendisi; CMO herkes için tam `CrewReading` |
| DELETE | `/checkins` | Yalnız CMO; bütün manuel check-in'leri kaldırır |
| POST | `/notes` | `{day,text}`; en fazla 1.000 karakter, kişinin kendi notu |
| POST | `/tasks` | `{day,key,done}`; kişinin görev işareti |
| POST | `/messages` | `{day,body,kind?,mission?,toUserId?}` |
| POST | `/emergencies` | `{scenario,patient,day,startedAt,steps,mission?}`; Dünya yazamaz |
| GET | `/reword` | İsteğe bağlı bulut yeniden ifade etme özelliğinin durumu |
| POST | `/reword` | Yerel Node API'de oturum gerekir; `{question,text}` |
| GET | `/ai/status` | Oturum gerekir; yerel Ollama/model envanter durumu |
| POST | `/ai/explain` | Oturum + bulgu yetkisi; `{crewId,findingId,day,mission?,language?}`; Dünya 403 |
| GET | `/ai/pipeline/status` | İki model + ses yapılandırma durumu; oturum gerekir |
| POST | `/chat` | Mürettebat/CMO; metin + isteğe bağlı yetkili bulgu; kalıcı geçmiş yok |
| GET | `/voice/status` | Ses yapılandırması; gerçek motor doğrulaması iddiası yok |
| POST | `/voice/transcribe?language=tr` | Açık ses onayı; ham mono PCM16/16 kHz WAV, 30 saniye sınırı |
| POST | `/voice/speak` | Açık ses onayı; yalnız aynı kullanıcıya ait kısa ömürlü `{replyId}` |

`day`: 1–90 tam sayı. Assessment için `mission`: `iss`, `moon`, `mars`; `mode`: `earth`, `space`. Varsayılanlar: 60, `mars`, `space`. Mesaj/acil durum kayıtlarında eksik veya tanınmayan mission mevcut uyumluluk nedeniyle `mars` gecikmesini kullanır.

## Yeni frontend için değerlendirme

```js
const response = await fetch('/api/assessment?day=60&mission=mars&mode=space', {
  headers: { Authorization: `Bearer ${token}` },
})
const data = await response.json()
if (!response.ok) throw new Error(data.error)
// data.subjects -> kişi/kabin, iki kural kümesi ve veri kaynağı/yaşı
// data.report -> Dünya'ya gönderilebilen düz metin
```

Yanıtın üst düzeyi:

```ts
{
  day: number
  mission: 'iss' | 'moon' | 'mars'
  mode: 'earth' | 'space'
  simulated: true
  subjects: Subject[]
  sources: Record<string, Source>
  summary: { earth: number; space: number; falseAlarms: number; missed: number }
  report: string
}
```

Kesin tipler: `src/assessment.ts`, `src/model.ts` (`Subject`, `Provenance`), `src/triage.ts` (`Finding`, `CrewReading`). `Finding` alanları: `id`, `title`, `level`, `measured`, `why`, `next`, `sourceIds`. Seviyeler: `green`, `amber`, `red`. `sources` sözlüğü, bu bulguların kaynak başlığı, URL, açıklama ve `verified`/`partial`/`demo` durumlarını taşır; frontend kaynak modülünü kopyalamadan atıfları gösterebilir.

`falseAlarms` ve `missed` geriye dönük alan adlarıdır: bağımsız klinik doğruluk değil, iki kural kümesinin uyuşmazlık sayılarıdır. Yeni tasarımda bunu açıkça anlatın.

## State yanıtı

`{user,now,messages,checkIns,events,notes,tasksDone,emergencies}`. `now` sunucunun epoch milisaniyesidir. `checkIns` anahtarı `C1:60` biçimindedir. Dünya kullanıcısına check-in/not/acil durum tabloları verilmez; yalnız gecikmesi dolmuş iletiler ve kendi gönderdiği iletiler döner.

Yazma uç noktaları genellikle güncel state'i döner. Giriş ve çıkış bunun istisnasıdır. Güncel aynı-origin frontend adaptörü `frontend/js/backend.js` içindedir.

## Mesaj gizliliği ve boyutlar

- `kind`: `message` veya `report`; diğer değerler normal mesaj gibi işlenir.
- Normal mesaj: 4.000; sağlık raporu: 16.000 karakter.
- Mürettebat kendi gönderdiği iletileri, CMO gemi iletilerini görebilir. Dünya gemi iletilerini gecikme dolunca görür.
- Dünya yanıtında `toUserId` ile `C1`–`C4` seçilebilir. Yoksa **C2/CMO** alıcıdır; yanıt bütün ekibe yayımlanmaz. CMO, teslim edilmiş Dünya yanıtlarını da görebilir.
- Eski, alıcısız Dünya yanıtları yalnız CMO ve Dünya'ya gösterilir.
- Acil durum tablosu hasta, kaydı oluşturan kullanıcı ve CMO ile sınırlıdır. Eğitim amacıyla bir mürettebat üyesi başka kişi için acil durum kaydı oluşturabilir.
- `mission` gecikmeyi seçer; farklı görevler için ayrı mesaj kutusu veya ayrı check-in veritabanı oluşturmaz.

## Acil durum / görsel girişleri

`startedAt`: ayrıştırılabilir tarih. `steps`: 1–30 adet `{title,atSeconds}`; başlık 1–120 karakter, süre sonlu, negatif olmayan ve azalmayan sayı olmalıdır. Senaryo metni henüz onaylı protokol kimliğiyle sınırlandırılmaz; bunlar eğitim kayıtlarıdır.

Check-in bütün ölçümleri içerir; kısmi PATCH yoktur. Görseller sıkıştırılmış JPEG data URL olarak en fazla 400.000 karakter kabul edilir. Görsel yorumlanmaz ve raporla gönderilmez. Ölçüm sayıları ve aralıkları `src/validate.ts` içindedir; bunlar veri giriş kontrolüdür, klinik eşik değildir.

## Hata durumları

`400`: geçersiz giriş, `401`: oturum yok/süresi dolmuş, `403`: yetki yok, `404`: bulunamadı, `413`: gövde büyük, `429`: hız sınırı, `500`: beklenmeyen sunucu hatası. Ağ hatalarını yeni frontend kendi adaptöründe ele almalıdır; tarayıcı demo arka ucu artık yoktur.

Varsayılan JSON gövde sınırı 20.000 bayttır; check-in/görsel ve uzun rapor uç noktaları daha büyük sınır kullanır. API şimdilik prototip sözleşmesidir; değişikliklerde bu belgeyi ve entegrasyon testlerini birlikte güncelleyin.

## Yerel AI açıklaması

`/ai/explain` yalnız sunucunun kurallarıyla ürettiği tek uzay bulgusunu kullanır; istemciden ham sağlık bağlamı, prompt, model adı veya runtime URL'si almaz. Dil `tr`/`en` (varsayılan `en`). Model mevcut alarmı değiştirmez ve hiçbir kayıt yazmaz.

Yanıt: `{state,original:{finding,provenance,sources},generated:string|null,experimental:true,disclaimer,model?}`. Kırmızı/eski bulgu veya model/bağlantı sorunu için HTTP 200 ve `generated:null` dönebilir; istemci `state` alanını kontrol etmelidir. Bu durumda orijinal bulgu kullanılmalıdır. Yetkisiz çağrılar 401/403, geçersiz giriş 400, bulunamayan bulgu 404, hız sınırı 429 döner. Otomatik bulut fallback yoktur.

`/ai/status` oturumlu kullanıcıya yapılandırılmış servis ve model aliasının durumunu bildirir; `ready` inference veya klinik doğrulama anlamına gelmez. Kurulum, tüm durum değerleri, model seçimi ve sınırlar: [LOCAL_AI.md](LOCAL_AI.md).

## İki-model sohbet ve ses

`/chat` alanları: `{message,language?,crewId?,findingId?,day?,mission?,inputOrigin?,transcriptConfirmed?}`. Mesaj 1–2000 karakter; API varsayılanları `tr`, oturum sahibi, 60, `mars`; frontend sohbet dili seçimine göre `language:"en"` veya `"tr"` gönderir. `inputOrigin:"voice"` için `transcriptConfirmed:true` zorunlu. `findingId` gerekli değildir: genel mesajlar doğrudan Qwen3'e, sağlıkla ilgili serbest sorular MedGemma'ya gönderilir. Kelime eşlemesi yalnız rol seçer; artık `needs_context` ret yolu yoktur. Yetki kontrolü sunucudadır; acil işaretler/kırmızı bulgular önceliklidir.

Güncel frontend arayüzü İngilizce kalır, ancak sohbet için Auto/English/Turkish seçimi sunar. Auto mesaj dilini basit bir sezgiselle belirleyip `language:"tr"` veya `"en"` gönderir; API `auto` değeri kabul etmez. Kayıt dilini kesinleştirmek için kullanıcı English/Turkish seçebilir. Bu dil seçimi önceki sohbet içeriğinin sunucuya gönderildiği anlamına gelmez.

Yanıt: `{route,reply,specialist,companion,original?,experimental:true,replyId,replyExpiresInSeconds:120,persisted:false}`. `route` urgent/medical/social olabilir; social artık genel sohbeti de içerir. Seçili bulgu varsa kanonik sağlık metni korunur. Bulgu olmadan sağlık sorulursa doğrudan MedGemma'nın genel eğitim yanıtı ve açık deneysel uyarı gösterilir; Qwen3 yalnız empatik giriş seçebilir. Genel sohbette Qwen3 serbest metin üretir. `/voice/speak` son `reply` metnini okur. Model eksik/kapalı/hatalıysa bunun model yanıtı olmadığı açıkça belirtilir. Sohbet stateless'tir; önceki mesajlar veya sağlık kayıtları serbest soruya otomatik eklenmez. Yanıt doğruluğu prompt kurallarıyla garanti edilemez.

MedGemma serbest sağlık yanıtında yalnız `{reply:string}` JSON'u kabul edilir. Özel düşünme token'ları (`<unused94>` vb.), tanınan taslak/eleştiri başlıkları, ek JSON alanları ve `done_reason:"length"` çıktısı kullanıcıya iletilmez; bu durumda `rejected`/`truncated` servis bildirimi döner. Geçersiz taslaktan bir bölüm seçilmez ve taslak Qwen/TTS'ye gönderilmez. Bu çıktı kontrolü tıbbi doğruluk garantisi değildir.

Ses endpointleri `X-Voice-Consent:true` ister. STT otomatik chat başlatmaz; transkript kullanıcıya onaylatılır. `replyId` kullanıcıya özel, en fazla iki dakika RAM'de tutulur; veritabanına yazılmaz. Yanlış kullanıcı/eskimiş receipt 404; yanlış codec 415; büyük ses 413; kapalı servis 503; upstream hata 502; meşgul/hız sınırı 429. Ayrıntılı ses biçimi, Python referans servisi ve tarayıcı kullanım akışı: [DUAL_AGENT_VOICE.md](DUAL_AGENT_VOICE.md).
