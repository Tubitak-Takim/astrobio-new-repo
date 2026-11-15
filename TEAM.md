# Astrobio ekibi ve geliştirme sorumlulukları

Bu depo, mevcut prototip temel alınarak aşağıdaki ekibin geliştireceği sürüm için düzenlenmiştir. Simüle astronot hesapları ekip üyelerini temsil etmez; geliştirme rolleri ile uygulama erişim rolleri farklıdır.

| Ekip üyesi | Rol | Birincil alanlar | Teslimat |
|---|---|---|---|
| **Işıkhan IŞIK** | AI-ML Developer | `src/triage.ts`, `src/handbook.ts`, `src/data/sources.ts`, `server/reword.js` | Kaynaklı karar desteği, asistan değerlendirmesi, veri/model deneyleri ve sınırlarının belgelenmesi |
| **Muhammet Kerim Şahin** | Backend Development | `server/`, `src/assessment.ts`, `src/access.ts`, `src/validate.ts` | API, veri saklama, yetkilendirme, yapılandırma ve backend ayrıştırması |
| **Elif Nur Özek** | Frontend | Sıfırdan geliştirilecek yeni arayüz; `docs/FRONTEND_HANDOFF.md` | Teknoloji/tasarım seçimi, özgün arayüz, erişilebilirlik ve API entegrasyonu |
| **Zehra Kaygısız** | Integration and Testing | `*.test.ts`, `.github/workflows/ci.yml`, `docs/QUALITY.md` | Entegrasyon, rol matrisi, regresyon testleri ve sürüm kabulü |

## Çalışma sınırları

- **Yeni frontend entegre edildi.** Sağlanan HTML/CSS/JS tasarımı `frontend/` altında aynı-origin API'ye bağlıdır. Elif arayüzü bu temel üzerinde geliştirir; bağımsız sentetik skorları yetkili backend bulgularından ayrı tutar.
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
   Yerel model için: [MedGemma araştırmasındaki](docs/LOCAL_AI.md) seçilmiş `medgemma1.5:4b` etiketinin köken/lisansını ve kilit digest'ini incelemek. Kurulum aracı yalnız açık onayla indirir; quantization ve sistem sürücüsü kurulumu yapmaz.
4. Tüm ekip: ölçüm geçmişi modelini tasarlama, yeni arayüzü bağlama ve uçtan uca testler.
5. İki-model/ses pilotu: Işıkhan ikinci model ve ses ağırlığı/lisans değerlendirmesi; Muhammet yerel servisler ve orkestrasyon; Elif mikrofon izni/transkript onayı/oynatma; Zehra gerçek cihaz, Türkçe ve kriz senaryoları. [Hazırlanan akış](docs/DUAL_AGENT_VOICE.md).

Başlangıç belgeleri: [API](docs/API.md), [frontend devri](docs/FRONTEND_HANDOFF.md), [backend yeniden kullanımı](server/README.md), [kalite ve bilinen sınırlar](docs/QUALITY.md).
