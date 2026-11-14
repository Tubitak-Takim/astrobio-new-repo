# AI-ML çalışma alanı

Sorumlu: **Işıkhan IŞIK**. API entegrasyonu: Muhammet Kerim Şahin. Değerlendirme: Zehra Kaygısız.

## Bugün ne var?

- `src/triage.ts`: açıklanabilir, deterministik karar kuralları; eğitilmiş model değil.
- `src/handbook.ts`: İngilizce anahtar kelime eşleştirmeli çevrimdışı asistan; semantik dil modeli değil.
- `src/data/sources.ts`: kaynakların `verified`, `partial`, `demo` etiketleri; klinik doğrulama değildir.
- `api/reword.js`: isteğe bağlı Gemini yeniden ifade etme. Yalnız yönergeyle sınırlandırılıyor; modelin yeni bilgi üretmeyeceği matematiksel olarak garanti edilmiyor. Orijinal metin korunur.

## Önerilen ilk teslimatlar

1. Sağlık sinyali, acil durum, belirsiz soru ve kapsam dışı soruları kapsayan değerlendirme kümesi.
2. Türkçe/İngilizce asistan desteği için sözlük ve eşleştirme deneyleri; bugünkü tokenizer Türkçe desteği sağlamaz.
3. Kaynak, sayı, birim ve tavsiyenin korunması için otomatik yeniden ifade etme kontrolleri.
4. Yanıtın bulunamadığı durumda güvenli geri çekilme; konuyla zayıf eşleşen sorularda yanlış sinyal seçiminin ölçülmesi.
5. Gerçek veri temin edilebilirse, ayrı ve açıkça deneysel bir anomali modeli. Mevcut klinik kuralların yerine sessizce geçirilmemeli.

## Deney kuralları

- Simüle veriyle öğrenilen sonuçlar gerçek astronotlar üzerinde ölçülmüş doğruluk olarak sunulmaz.
- Eğitim/validasyon/test ayrımı kişi ve zaman sızıntısını engelleyecek şekilde yapılır.
- Veri kökeni, kullanım izni, örneklem büyüklüğü, eksik değerler ve sınırlamalar kaydedilir.
- Model sürümü, girdiler, belirsizlik ve açıklama gösterilir; ilaç veya doz önerisi üretilmez.
- Gerçek sağlık verisi açık izin ve veri politikası olmadan bulut hizmetlerine gönderilmez.
- Yeni model entegrasyonu için önce API sözleşmesi ve Zehra'nın regresyon/kabul testleri belirlenir.

Statik Vercel yeniden ifade etme fonksiyonu mevcut Node oturum sistemiyle ortak değildir ve halen halka açık demo uç noktasıdır. Gerçek kullanımda ayrı kimlik doğrulama ve kota altyapısı olmadan dağıtmayın. Yerel Node `/api/reword` uç noktası artık oturum kontrolü yapar.
