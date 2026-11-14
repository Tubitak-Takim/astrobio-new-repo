# Astrobio API demo senaryosu

Bu sürümde frontend yoktur. Terminal, Postman veya benzeri bir HTTP istemcisiyle demo yapılır. Bütün kişiler ve günlük ölçümler simüledir; bu bir tıbbi cihaz değildir.

## 1. Başlatma

```bash
npm run dev
```

Başka terminalde:

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/users
curl -X POST http://127.0.0.1:8787/api/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"C2","pin":"2026"}'
```

## 2. Sağlık değerlendirmesi

Giriş yanıtındaki token ile `TOKEN_BURAYA` değerini değiştirin:

```bash
curl 'http://127.0.0.1:8787/api/assessment?day=60&mission=mars&mode=space' \
  -H 'Authorization: Bearer TOKEN_BURAYA'
```

`subjects` içindeki Dünya/uzay bulgularını, `sources` içindeki demo/kısmi/kaynaklı etiketleri ve `report` metnini gösterin. Sayaçlar bağımsız klinik doğruluk değildir.

## 3. Roller ve gecikme

`C1` ile giriş yapıp assessment sonucunun yalnız C1+kabin içerdiğini gösterin. `FS` ile aynı endpointin 403 döndüğünü doğrulayın; Dünya yalnız gönderilen raporları alır.

CMO token'ıyla bir ileti gönderin:

```bash
curl -X POST http://127.0.0.1:8787/api/messages \
  -H 'Authorization: Bearer TOKEN_BURAYA' \
  -H 'Content-Type: application/json' \
  -d '{"day":60,"mission":"mars","body":"Astrobio demo raporu: bütün veriler simüledir.","kind":"report"}'
```

FS token'ıyla `/api/state` çağrısında mesajın gecikmeden önce görünmediğini, demo gecikmesi dolunca göründüğünü gösterin. Mars'ta bir dakika gerçek gecikme bir saniye oynatılır. Dünya yanıtında `toUserId` alıcısını belirtin; belirtilmezse yanıt C2/CMO'ya gider.

## 4. Otomatik doğrulama

```bash
npm test
npm run build
```

Testler ayrı geçici veritabanı kullanır; demo yaptığınız veritabanını değiştirmez. Ayrıntılı alanlar ve sınırlar: [API sözleşmesi](docs/API.md).
