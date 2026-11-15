# ASTROBIO — Entegre Uzay Sağlığı İzleme Frontend Prototipi

> Tarihsel tasarım belgesi: aşağıdaki bağımsız prototip talimatları kaynak paketten korunmuştur. Güncel API entegrasyonu ve çalıştırma için [README_PROJE.md](README_PROJE.md) kullanın. AI ve rapor ekranları artık backend'e bağlıdır.

> **Önemli:** Bu proje gerçek bir tıbbi cihaz, teşhis sistemi veya doğrulanmış performans ölçüm aracı değildir. Gösterilen sağlık ölçümleri ve yüzdelik halkalar **sentetik demo verisidir**. Gerçek NASA tıbbi kayıtları içermez. Yapay zekâ ekranı gerçek bir dil modeline bağlı değildir.

Bu sürüm; ASTROBIO'nun mevcut koyu lacivert / neon mavi görev kontrol tasarımını koruyarak, kullanıcı tarafından gönderilen 8 mobil sağlık arayüzü örneğindeki **halka gösterge, detay satırı, şerit grafik, günlük karşılaştırma ve zaman çizelgesi** yaklaşımlarını özgün ASTROBIO arayüzüne uyarlamaktadır. Üçüncü taraf markanın görselleri ve logosu projeye kopyalanmamıştır.

## Başlatma

1. ZIP dosyasını ayrı bir klasöre çıkarın. Önceki ASTROBIO klasörünü silmeyin.
2. VS Code'da **ASTROBIO_Yeni_Arayuz_Entegre** klasörünü açın.
3. `frontend/index.html` dosyasına sağ tıklayıp **Open with Live Server** seçin.
4. Alternatif olarak terminalde: `cd frontend && python -m http.server 5500`, sonra `http://127.0.0.1:5500` adresini açın.

`file://` yöntemi 3D modül yüklemeyi engelleyebilir. Live Server / HTTP kullanın.

## Tam sayfa listesi

| Menü / Modül | Dosya | Arayüz |
|---|---|---|
| Main Panel | `index.html` | Görev özetleri, 4 halka skor kartı, sağlık ölçümleri, BIS grafikleri, RIDGE, rapor ve uyarı |
| Uyku Analizi | `uyku.html` | Uyku halka göstergesi, bileşen ilerleme çubukları, 7 günlük eğilim |
| Toparlanma | `toparlanma.html` | Demo toparlanma halka göstergesi, nabız/uyku/kalite bileşenleri |
| Günlük Yük | `gunluk-yuk.html` | 0–21 görsel yük endeksi, son yedi günü seçme, karşılaştırmalar |
| Görev Sağlığı | `gorev-sagligi.html` | Kayıt bütünlüğü halka göstergesi, yeşil parçacık efekti, kayıt zaman çizelgesi |
| Günlük Etkiler | `gunluk-etkiler.html` | Dönem seçimi, 5 örnek ilişki çubuğu, yorumlama sınırları |
| Ask to AI | `ask-to-ai.html` | Kural tabanlı demo sohbet ve hazır sorular; gerçek AI değil |
| Personel Info | `personel-info.html` | Örnek astronot profili ve görev bilgisi |
| Interactive Health Check | `health-check.html` | Open Anatomy 3D, katmanlar, bölge seçimi; indirilemezse 2D harita |
| Ölçümler | `olcumler.html` | Grafik/tablo, CSV indir, yerel JSON içe aktar |
| BIS Analizi | `bis-analizi.html` | Cole modeli etkileşimi ve R₀ trend grafiği |
| RIDGE | `ridge.html` | Radiation, Isolation, Distance, Gravity, Environment |
| Reports | `raporlar.html` | Örnek rapor, JSON indirme, yazdır/PDF, yerel sakla-ilet demosu |
| Calendar | `takvim.html` | Renkli görev döngüsü, aylık takvim, tarayıcıda not kaydetme |

## 8 arayüz görseli ile entegrasyon

`TASARIM_ESLESTIRME.md` belgesinde her referansın hangi ASTROBIO bileşenine uyarlandığı açıklanmıştır. 8. görseldeki kişisel döngü takibinin renkli zaman çizelgesi yaklaşımı, **kişisel sağlık veya üreme verisi tutulmadan** görev planı döngüsüne uyarlanmıştır.

## Kullanıcı görselleri ve 3D anatomik model

Gezegen fotoğraflarını kendiniz ekleyin:

```
frontend/assets/leo.jpg
frontend/assets/moon.jpeg
frontend/assets/mars.jpeg
```

Bu fotoğraflar yoksa temsilî CSS gezegenleri gösterilir.

3D anatomik model dosyası internetten bu pakete gömülemedi. Daha önce indirdiğiniz Open Anatomy 3D modelini yerleştirin:

```
frontend/assets/models/anatomy-male.glb
```

Dosya olmaması halinde sistem çevrimiçi açık kaynak modeli deneyebilir; o da kullanılamazsa tıklanabilir 2D vücut haritasına geçer. Open Anatomy 3D / BodyParts3D atıfları arayüzde ve `frontend/README_PROJE.md` içinde belirtilmiştir. Model lisansı CC BY 4.0'dır.

## Demo veriler ve entegrasyon noktaları

- `frontend/js/data.js`: sentetik ölçüm verileri, görev modları ve anatomik bölge tanımları
- `frontend/js/app.js`: 14 arayüzün oluşturulması, halka gösterge hesapları ve kullanıcı etkileşimleri
- `frontend/js/anatomy.js`: Three.js / Open Anatomy görüntüleyicisi, 2D yedek
- `frontend/css/style.css`: ortak tema ve yeni sayfa düzenleri
- `frontend/data/demo-records.json`: örnek veri dosyası

Gösterge yüzdeleri yalnızca arayüzün nasıl çalışacağını göstermek için basit matematiksel temsillerdir; klinik skor, sağlık tahmini veya egzersiz hedefi değildir.

Gerçek veri geldiğinde REST API / yetkili backend adaptörü, veri kalite değerlendirmesi, BIS doğrulaması ve klinik sınırlar ekip tarafından ayrıca geliştirilmelidir. Sunucuya gerçek rapor gönderme ve gerçek AI entegrasyonu bu sürümde yoktur. Hassas gerçek sağlık kayıtlarını bu demo tarayıcısına yüklemeyin.

## Gereksinimler

- Chrome / Firefox / Edge (güncel sürüm)
- Live Server veya `python -m http.server`
- 3D model için WebGL ve internet erişimi (kütüphaneler CDN'den alınır)
- npm, React ya da derleme sistemi gerekmiyor

## Doğrulama

- JavaScript sözdizimi `node --check` ile doğrulandı.
- 13 bölümün HTML içerik üretimi bağımsız JavaScript çalışma ortamında kontrol edildi; 3D model sahnesi ise gerçek WebGL/CDN gerektirdiğinden tarayıcıda ayrıca sınanmalıdır.
- Burada tarayıcı tabanlı tam uçtan uca görüntü testi gerçekleştirilemedi; kendi bilgisayarınızda Live Server ile doğrulayın.
