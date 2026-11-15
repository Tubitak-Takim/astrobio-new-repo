# Astrobio API sözleşmesi

Sorumlu: **Muhammet Kerim Şahin**. Frontend: **Elif Nur Özek**. Entegrasyon doğrulaması: **Zehra Kaygısız**.

Base URL geliştirmede `/api` proxy'si veya `http://127.0.0.1:8787/api`. JSON kullanılır. Giriş dışındaki korumalı çağrılarda `Authorization: Bearer <token>` gönderin. Hatalar `{ "error": "..." }` döner.

`/crew-data` yanıtı `version`, `mission`, `day`, `fromDay`, `simulated:true`, rol filtreli `crew` ve `limitations` alanlarını içerir. Her kişi için kurmaca profil, kaynak durumları, `series[{day,origin,reading,cabin,measurementDays}]` ve hesaplanan `relationships[{id,label,r,n,manualPoints,sourceIds,note}]` döner. `origin` sentetik snapshot veya o güne ait manuel kayıt olarak ayrılır; görüntü/notlar aktarılmaz. `r:null` yetersiz/değişmeyen seri demektir; nedensellik veya klinik risk değildir. [Üretim ve kaynak ayrıntıları](SYNTHETIC_CREW_DATA.md).

`/observations` artık `symptoms:["dizziness","nausea"]` gibi doğrulanmış 16 belirti kategorisini de kabul eder; `values` boş veya eksik olabilir. Bunlar kişinin bildirdiği belirtilerdir, tanı veya üretilmiş ölçüm değildir. Yanıttaki `observation.symptoms` kaydedilen kategorileri belirtir. [Desteklenen Türkçe/İngilizce ifadeler ve çoklu belirti kuralları](LIVE_MONITORING.md#conservative-chat-writes-and-context).

## Uç noktalar

| Metot | Yol | Yetki / açıklama |
|---|---|---|
| GET | `/health` | Herkese açık, `{ok:true}` |
| GET | `/users` | Demo hesapları; gerçek kimlik dizini değildir |
| POST | `/login` | `{userId,pin}` → `{token,user}`; oturum 12 saat |
| POST | `/logout` | Mevcut oturumu siler |
| GET | `/state` | Kullanıcının görebileceği kayıtlar |
| PUT | `/light-plan/cabin` | CMO için ortak kabin Earth UTC takvimi; `{crewId,day,mission,config:{wakeTime,bedTime,autoEnabled}}`; yalnız simülasyon hedefi |
| GET | `/telemetry/export.csv?day=90&mission=mars` | Yetkili yapılandırılmış kayıtların tek CSV çıktısı; yalnız gemi içi roller |
| POST | `/telemetry/bundles` | `{day,mission,requestId}`; değişmez gzip/SQLite snapshot ve gecikmeli demo Dünya kuyruğu |
| GET | `/telemetry/bundles` | Yetkili paket özeti; Dünya yalnız demo teslim süresi dolanları görür |
| GET | `/telemetry/bundles/:id/csv` | Yetki + teslim süresi + SHA-256 kontrolünden sonra kayıtlı CSV |
| GET | `/light-plan?crewId=C1&day=2&mission=mars` | Kişisel ışık/uyku takvimi, kaynak etiketleri, otomatik inceleme ve geçmiş; Dünya 403 |
| PUT | `/light-plan/preferences` | `{crewId,day,mission,preferences:{wakeTime,bedTime,autoReview}}`; doz/cihaz ayarı kabul etmez |
| POST | `/light-plan/stress` | `{crewId,day,mission,score}`; 0–10 tam sayı, yalnız oturum sahibinin öz-bildirimi |
| POST | `/light-plan/actions` | Hatırlatma onayı veya kırmızı ışık araştırma incelemesi talebi; tedavi başlatma/onaylama yok |
| POST | `/observations` | Yetkili kişi/gün/görev için kısmi canlı ölçüm; source/ölçüm/alım zamanı ile kalıcı kayıt, HTTP 201 |
| GET | `/observations?crewId=C1&day=60&mission=mars` | Yetkili bağlamdaki son 50 örnek, toplam sayı ve sunucu zamanı; Dünya 403 |
| GET | `/crew-data?day=90&mission=mars&window=90` | Sentetik astronot serileri, ölçüm günleri ve hesaplanan ilişkiler; mürettebat kendisi, CMO dört kişi, Dünya 403 |
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

`/light-plan` artık `cabinLighting` alanında ortak görev takviminin sunucu UTC’sinden hesaplanan ışık hedefini verir; seçili astronotun kişisel saatleriyle karıştırılmaz. Gerçek lamba ölçümü/komutu yoktur. Birleşik CSV `mission-csv-v1` uzun tablo biçimindedir; birim, kaynak, ölçüm günü/zamanı ve kapsam alanlarını korur. Kayıtlı paketler gzip sıkıştırılmıştır; SHA-256 UTF-8 BOM dahil açılmış CSV baytları üzerindedir. İndirme gönderim değildir; demo teslimi gerçek alıcı onayı değildir. [Tam sözleşme ve araştırma](CIRCADIAN_TELEMETRY.md).

Işık planlama uç noktaları `{persisted:true,receipt,plan}` yazma yanıtı verir; `plan.deviceConnected:false` ve `plan.exposureAuthorized:false` her zaman açıktır. Yeni sağlık verileri seçili bağlamın inceleme kurallarını tetikleyebilir; `/observations` ve `/chat` ek `lightReview` meta verisi döndürebilir. Bunlar doğrulanmış stres tanısı veya tedavi talimatı değildir. [Kural eşikleri, yetki, saat ve kalıcılık sözleşmesi](LIGHT_PLAN.md).

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

Yanıt: `{route,reply,specialist,companion,original?,experimental:true,replyId,replyExpiresInSeconds:120,persisted,healthRecord:{status,reason,observation}}`. `persisted:true` yalnız desteklenen doğrudan öz-bildirimin ayrı sağlık gözlemi olarak kaydedildiğini belirtir; tüm sohbet kaydedilmez. Kendi hesabı seçiliyken “Başım ağrıyor” / “I have a headache” otomatik kaydedilir ve aynı isteğin değerlendirmesine girer. Olumsuz/varsayımsal/üçüncü-şahıs/karmaşık ifadeler kaydedilmez. `route` urgent/medical/social olabilir; acil bulgular önceliklidir. Seçili bulgu ve kayıt özetlerinde kanonik metin/sayılar korunur. Genel sohbet Qwen3, genel sağlık eğitimi MedGemma kullanır. `/voice/speak` son `reply` metnini okur. Önceki sohbet geçmişi otomatik eklenmez; kayıt incelemeleri ve yeni kaydedilen öz-bildirimler yetkili sınırlı bağlam alabilir. [Canlı API sözleşmesi, kayıt önceliği ve jüri sunumu](LIVE_MONITORING.md).

**Veritabanı özeti istendiğinde:** “Genel sağlık verilerimi analiz et”, “Analyze my health records” gibi istekler seçili yetkili kişi/gün için sunucu üretimli bağlam alır. Önceki paragraftaki kayıtsız genel eğitim akışından farklı olarak yalnız bu istekte ölçümler, baz çizgi, kural sonuçları, kaynak/güncellik ve en fazla yedi önceki kaydın sınırlı özeti aktarılır. İstemcinin gönderdiği `healthContext` dikkate alınmaz. Başka kişiler, isimler, notlar, mesajlar ve görseller aktarılmaz. `healthContext:{subjectId,day,mission,origin,previousSavedReadings,staleFindingIds}` yanıt meta verisi kaynağı açıklar; origin `database_checkin` veya `simulated_feed` olabilir. Bu, SQL erişimi veren bir model aracı değildir.

Yeni kaydedilen desteklenen öz-bildirim de aynı sınırlı bağlamı tetikleyebilir. Kayıt bağlamı son yedi görev gününden en fazla sekiz sağlık güncellemesi içerir; belirti bildirimleri hızlı ölçüm akışına göre öncelik alır. Yeni tam check-in eski ölçüm alanlarını geçersiz kılar, fakat belirtiler kendi zamanlarıyla tarihsel öz-bildirim olarak kalır. Başka görevler/gelecek günler eklenmez. `origin` temel kaydı belirtir; güncellemeler `recentObservations` içinde ayrı kaynak ve zaman taşır. `/ai/pipeline/status` geçmiş için `memory:"stateless"`, yapılandırılmış sağlık kayıtları için ek `healthMemory:"structured_observations"` alanını verir.

Bu kayıt akışında Qwen yalnız `opening` ve mevcut bulgu ID'lerinden oluşan `findingIds` seçebilir; serbest tıbbi yorum/metin, ek alan veya uydurma bulgu kabul edilmez. Sayılar, kural seviyeleri, ölçüm yaşları ve kaynak etiketleri sunucuda üretilir; işaretli/eski bulgular gizlenemez. MedGemma çıktısı tamamlanmamış veya kayıtlarda bulunmayan sayılar içeriyorsa Qwen'e verilmez. MedGemma başarısız olsa da Qwen yetkili kural/veri paketinden seçim yapabilir. Seçim de başarısızsa model cevabı olmadığı açıkça belirtilen kanonik kayıt/kural özeti döner. Genel sohbet ve yalnız eğitim sorularında kayıt aktarımı yapılmaz. Sayısal kontrol ve kural motoru klinik doğruluk garantisi değildir.

MedGemma serbest sağlık yanıtında yalnız `{reply:string}` JSON'u kabul edilir. Özel düşünme token'ları (`<unused94>` vb.), tanınan taslak/eleştiri başlıkları, ek JSON alanları ve `done_reason:"length"` çıktısı kullanıcıya iletilmez; bu durumda `rejected`/`truncated` servis bildirimi döner. Geçersiz taslaktan bir bölüm seçilmez ve taslak Qwen/TTS'ye gönderilmez. Bu çıktı kontrolü tıbbi doğruluk garantisi değildir.

Ses endpointleri `X-Voice-Consent:true` ister. STT otomatik chat başlatmaz; transkript kullanıcıya onaylatılır. `replyId` kullanıcıya özel, en fazla iki dakika RAM'de tutulur; veritabanına yazılmaz. Yanlış kullanıcı/eskimiş receipt 404; yanlış codec 415; büyük ses 413; kapalı servis 503; upstream hata 502; meşgul/hız sınırı 429. Ayrıntılı ses biçimi, Python referans servisi ve tarayıcı kullanım akışı: [DUAL_AGENT_VOICE.md](DUAL_AGENT_VOICE.md).
