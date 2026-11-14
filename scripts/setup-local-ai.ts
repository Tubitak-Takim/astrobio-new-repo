import { execFileSync } from 'node:child_process'
import { totalmem, platform, arch } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { configuration, optionalFile, installedModel, pullModel, smokeTest, checkLock, parseLock, saveSetup, TERMS_URL } from './local-ai-setup.ts'

const HELP = `Astrobio yerel AI kurulumu (Node 24+)
  npm run setup:local-ai
  npm run setup:local-ai -- --yes
  npm run setup:local-ai -- --model medgemma1.5:4b
  npm run setup:local-ai -- --update-lock

--yes          Koşulları önceden incelediğinizi ve indirme/test/ayar yazımını onaylar.
--model NAME   .env içindeki modeli açıkça değiştirir.
--update-lock  Model adı/digest farkını, incelemeniz sonrası kilide işler.
--help         Değişiklik yapmadan bu yardımı gösterir.

Ollama ve GPU sürücüsü otomatik kurulmaz; model/servis bulunamazsa talimat verilir.
Sağlık verisi kullanılmaz. --yes verilmezse etkileşimli onay gerekir.`

function command(executable: string, args: string[]): string | null {
  try { return execFileSync(executable, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) { console.log(HELP); return }
  let yes = false
  let update = false
  let model: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--yes') yes = true
    else if (args[i] === '--update-lock') update = true
    else if (args[i] === '--model' && args[i + 1] && !args[i + 1].startsWith('--')) model = args[++i]
    else throw new Error('Geçersiz seçenek. Kullanım: npm run setup:local-ai -- --help')
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const originalEnv = await optionalFile(join(root, '.env'))
  const originalLock = await optionalFile(join(root, 'local-ai', 'model-lock.json'))
  const lock = originalLock === null ? null : parseLock(originalLock)
  const { config, envText } = configuration(originalEnv ?? await optionalFile(join(root, '.env.example')) ?? '', model, process.env)
  if (lock && lock.model !== config.model && !update) throw new Error('Seçilen model kilitle uyuşmuyor; bilinçli değişiklik için --update-lock gerekir.')
  console.log(`Astrobio | ${platform()}/${arch()} | RAM ${(totalmem() / 1024 ** 3).toFixed(1)} GiB`)
  const gpu = command('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'])
  console.log(`NVIDIA: ${gpu ?? 'Algılanamadı veya nvidia-smi yok; bu durum GPU bulunmadığını kesinleştirmez.'}`)
  const ollama = command('ollama', ['--version'])
  console.log(`Ollama CLI: ${ollama ?? 'Algılanamadı; çalışan HTTP servisi ayrıca kontrol edilecek.'}`)
  if (platform() === 'linux') {
    const os = await optionalFile('/etc/os-release') ?? ''
    if (/arch|endeavouros/i.test(os) && gpu && !command('pacman', ['-Q', 'ollama-cuda'])) {
      console.log('Uyarı: ollama-cuda paketi bulunamadı. NVIDIA desteği için paket kurulumunuzu kontrol edin; otomatik sudo çalıştırılmaz.')
    }
  }
  let installed
  try { installed = await installedModel(config) }
  catch {
    throw new Error(`Ollama servisine erişilemedi veya envanteri geçersiz: ${config.baseUrl}\nOllama kurulumu: https://ollama.com/download\nAyrı terminalde: OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve\nÖzel port/IPv6 kullanıyorsanız LOCAL_AI_URL ile Ollama dinleme adresini eşleştirin. Mevcut bir servisi ikinci kez başlatmayın.`)
  }
  // Reject remote aliases/digest changes BEFORE generation or editing settings.
  if (installed) checkLock(lock, installed, update)
  console.log(`Model: ${config.model} | Servis: ${config.baseUrl}`)
  console.log(installed ? 'Model zaten mevcut; tekrar indirilmeyecek.' : 'Model eksik: indirme birkaç GB olabilir; kesin boyut artefakta bağlıdır. Yeterli disk alanını kontrol edin.')
  console.log(`HAI-DEF koşulları: ${TERMS_URL}`)
  console.log('Bu Ollama etiketinin kökenini ayrıca doğrulayın; etiket resmi Google dağıtımının kanıtı değildir.')
  console.log('İşlem: gerekirse model indirme, sentetik bağlantı testi, .env içinde yalnız LOCAL_AI_* güncellemesi ve model digest kaydı.')
  console.log('Gemini/API_PORT/DB_FILE ve diğer ayarlar korunur. Güncellenen .env için özel izinli yedek oluşturulur.')
  if (lock && update) console.log('Dikkat: mevcut model kilidinin güncellenmesine izin verdiniz.')
  if (!yes) {
    if (!stdin.isTTY || !stdout.isTTY) throw new Error('Etkileşimli onay gerekiyor. Koşulları inceleyip onayladıysanız --yes ile çalıştırın.')
    const prompt = createInterface({ input: stdin, output: stdout })
    try {
      const answer = await prompt.question('Koşulları incelediniz ve bu işlemleri onaylıyor musunuz? [evet/hayır] ')
      if (!['evet', 'yes'].includes(answer.trim().toLowerCase())) { console.log('İptal edildi; ayarlar değiştirilmedi.'); return }
    } finally { prompt.close() }
  }
  if (!installed) {
    await pullModel(config, (percent) => console.log(percent === null ? 'İndirme başlatılıyor...' : `İndirme parçası: %${percent}`))
    installed = await installedModel(config)
    if (!installed) throw new Error('İndirme sonrasında model bulunamadı; ayarlar değiştirilmedi.')
  }
  const nextLock = checkLock(lock, installed, update)
  console.log('Kısa, tıbbi veri içermeyen üretim testi çalışıyor...')
  const result = await smokeTest(config)
  // Catch a concurrently changed model alias before saving its identity.
  const finalModel = await installedModel(config)
  if (!finalModel) throw new Error('Test sırasında model envanterden kaldırıldı; ayarlar değiştirilmedi.')
  checkLock(nextLock, finalModel, false)
  const backup = await saveSetup(root, originalEnv, envText, originalLock, nextLock)
  console.log(`Üretim testi başarılı (${(result.elapsedMs / 1000).toFixed(1)} sn). İşlemci: ${result.processor.toUpperCase()}`)
  if (result.processor === 'cpu') console.log('CPU üzerinde hazır; GPU hızlandırması doğrulanmadı. Sürücü/runtime desteğini kontrol edin.')
  if (result.processor === 'unknown') console.log('Üretim çalışıyor, fakat işlemci türü belirlenemedi; ollama ps ile kontrol edin.')
  console.log(`Model digest: ${nextLock.digest}`)
  console.log('local-ai/model-lock.json oluşturuldu/doğrulandı. Ekipçe aynı modeli kontrol etmek için inceleyip Git’e ekleyin.')
  if (backup) console.log(`.env yedeği: ${backup}`)
  console.log('Kurulum tamamlandı. API zaten çalışıyorsa yeniden başlatın: npm run dev')
  console.log('Tamamen yerel kullanım için Ollama’da OLLAMA_NO_CLOUD=1 kullanın; GEMINI_API_KEY ayarınızı araç değiştirmez.')
}

main().catch((error: unknown) => {
  console.error(`Kurulum tamamlanamadı: ${error instanceof Error ? error.message : 'Beklenmeyen hata.'}`)
  process.exitCode = 1
})
