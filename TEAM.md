# Ekip ve geliştirme sorumlulukları

Bu depo, mevcut prototip temel alınarak aşağıdaki ekibin geliştireceği sürüm için düzenlenmiştir. Simüle astronot hesapları ekip üyelerini temsil etmez; geliştirme rolleri ile uygulama erişim rolleri farklıdır.

| Ekip üyesi | Rol | Birincil alanlar | Teslimat |
|---|---|---|---|
| **Işıkhan IŞIK** | AI-ML Developer | `src/triage.ts`, `src/handbook.ts`, `src/data/sources.ts`, `api/reword.js` | Kaynaklı karar desteği, asistan değerlendirmesi, veri/model deneyleri ve sınırlarının belgelenmesi |
| **Muhammet Kerim Şahin** | Backend Development | `server/`, `src/assessment.ts`, `src/access.ts`, `src/validate.ts` | API, veri saklama, yetkilendirme, yapılandırma ve backend ayrıştırması |
| **Elif Nur Özek** | Frontend | Ekranlar, `src/api.ts`, `src/ui.tsx`, stiller | Ekibin özgün arayüzü, erişilebilirlik, responsive tasarım ve API entegrasyonu |
| **Zehra Kaygısız** | Integration and Testing | `*.test.ts`, `.github/workflows/ci.yml`, `docs/QUALITY.md` | Entegrasyon, rol matrisi, regresyon testleri ve sürüm kabulü |

## Çalışma sınırları

- **Frontend yeniden tasarlanacak.** Mevcut ekranlar çalışan referans olarak korunur; yeni tasarım henüz belirlenmiş veya uygulanmış değildir.
- **Backend yeniden kullanılacak ve uyarlanabilecek.** Yeni frontend, değerlendirmeleri `/api/assessment` üzerinden alabilir; React veya anatomik modelleri kopyalaması gerekmez.
- Mevcut AI-ML katmanı bir tahmin modeli değildir. Işıkhan'ın geliştireceği modeller, doğrulanmış klinik kural gibi gösterilemez; ayrıntılar [AI-ML çalışma rehberinde](docs/AI_ML.md).
- Ölçüm eşikleri ekip içi teknik kararla klinik olarak doğrulanmış hale gelmez. Kaynak durumu ve demo etiketi korunur.
- Orijinal kaynak, veri ve model kredileri korunur. Backend'i başka depoya taşımadan önce kullanım/lisans izinleri kontrol edilir.

## Ortak iş akışı

1. Küçük bir görev açın; sorumlu, API etkisi ve kabul ölçütünü yazın.
2. Örnek dallar: `feature/frontend-dashboard`, `feature/backend-api`, `feature/handbook-evaluation`, `test/role-isolation`.
3. API veya ortak tip değişikliklerinde Muhammet ve Elif birlikte sözleşmeyi günceller; Zehra regresyon testi ekler.
4. Kural veya asistan değişikliklerini Işıkhan inceler; klinik iddialar için ayrıca alan uzmanı gerekir.
5. Birleştirme öncesi `npm test` ve `npm run build` geçmelidir. Zehra'nın kalite kontrol listesi uygulanır.

## İlk geliştirme sırası

1. Elif: bilgi mimarisi, tasarım dili ve ekran taslakları; Zehra: kullanıcı akışları/kabul senaryoları.
2. Muhammet: değerlendirme API'si üzerinden yeni arayüz entegrasyonu; dağıtım ve veri politikası seçimi.
3. Işıkhan: asistan soru-cevap test kümesi, belirsizlik ve kaynak gösterimi; gerekiyorsa ayrı deneysel model prototipi.
4. Tüm ekip: ölçüm geçmişi modelini tasarlama, yeni arayüzü bağlama ve uçtan uca testler.

Başlangıç belgeleri: [API](docs/API.md), [frontend devri](docs/FRONTEND_HANDOFF.md), [backend yeniden kullanımı](server/README.md), [kalite ve bilinen sınırlar](docs/QUALITY.md).
