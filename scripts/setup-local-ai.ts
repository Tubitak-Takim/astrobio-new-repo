import { execFileSync } from 'node:child_process'
import { totalmem, platform, arch } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { configuration, optionalFile, installedModel, pullModel, smokeTest, checkLock, parseLock, saveSetup, TERMS_URL, COMPANION_TERMS_URL, type ModelRole } from './local-ai-setup.ts'
import { installVoice, voicePlan, VOICE_CARD, STT_REPO, assertVoiceConsentMode } from './voice-setup.ts'

const HELP = `Astrobio yerel AI kurulumu (Node 24+)
  npm run setup:local-ai
  npm run setup:local-ai -- --yes --accept-voice-license
  npm run setup:local-ai -- --yes --skip-voice
  npm run setup:local-ai -- --model medgemma1.5:4b
  npm run setup:local-ai -- --update-lock
  npm run setup:local-ai -- --role companion --model MODEL_ADI
  npm run setup:companion
  npm run setup:local-ai -- --voice-only
  npm run setup:voice
  npm run setup:local-ai -- --skip-voice

--yes          Koşulları önceden incelediğinizi ve indirme/test/ayar yazımını onaylar.
--model NAME   .env içindeki modeli açıkça değiştirir.
--role ROLE    Yalnız medical veya companion rolünü kurar; varsayılan ikisidir.
--update-lock  Model adı/digest farkını, incelemeniz sonrası kilide işler.
--voice-only   Yalnız ses ortamı, bağımlılıkları, ağırlıkları ve ayarlarını kurar.
--skip-voice   Varsayılan ses kurulumunu açıkça atlar.
--accept-voice-license  Ses/model koşullarını önceden incelediğinizin açık onayı.
--update-voice-lock     Ses kilidini günceller; yönetilen ağırlıkları yeniden indirebilir.
--help         Değişiklik yapmadan bu yardımı gösterir.

Ollama ve GPU sürücüsü otomatik kurulmaz; model/servis bulunamazsa talimat verilir.
Varsayılan akış MedGemma ve Qwen3 1.7B (qwen3:1.7b) rollerini sırayla kurar.
Mevcut özel modeller korunur. --model/--update-lock yalnız seçili role
(--role yoksa medical) uygulanır. setup:companion ses kurulumunu tekrar çalıştırmaz.
Ses kurulumu varsayılan dahildir. Python 3.11/3.12 venv (gerekirse mevcut uv ile
Python indirme), pip paketleri ve ses modelleri onayla hazırlanır.
Sağlık verisi kullanılmaz. --yes verilmezse etkileşimli onay gerekir.
--yes tek başına ses lisansı onayı değildir; otomasyonda ayrıca --accept-voice-license gerekir.`

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
  let selectedRole: ModelRole | undefined
  let voiceOnly = false
  let skipVoice = false
  let acceptVoiceLicense = false
  let updateVoice = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--yes') yes = true
    else if (args[i] === '--update-lock') update = true
    else if (args[i] === '--model' && args[i + 1] && !args[i + 1].startsWith('--')) model = args[++i]
    else if (args[i] === '--role' && ['medical', 'companion'].includes(args[i + 1])) selectedRole = args[++i] as ModelRole
    else if (args[i] === '--voice-only') voiceOnly = true
    else if (args[i] === '--skip-voice') skipVoice = true
    else if (args[i] === '--accept-voice-license') acceptVoiceLicense = true
    else if (args[i] === '--update-voice-lock') updateVoice = true
    else throw new Error('Geçersiz seçenek. Kullanım: npm run setup:local-ai -- --help')
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const originalEnv = await optionalFile(join(root, '.env'))
  if (voiceOnly && skipVoice) throw new Error('--voice-only ile --skip-voice birlikte kullanılamaz.')
  if (voiceOnly && (model || selectedRole || update)) throw new Error('--voice-only dil modeli seçenekleriyle birlikte kullanılamaz.')
  const initialText = originalEnv ?? await optionalFile(join(root, '.env.example')) ?? ''
  const plannedVoice = skipVoice ? null : voicePlan(root, initialText)
  if (plannedVoice) {
    console.log('Ses kurulumu: ayrı venv + faster-whisper/Piper + yerel ağırlıklar + sentetik TTS→STT testi. Ağ/disk kullanımı birkaç GB olabilir.')
    console.log(plannedVoice.managedTts ? `Varsayılan Türkçe ses kartı: ${VOICE_CARD}\nKartta veri lisansı CC BY-NC-SA 4.0 belirtiliyor. Ticari kullanıma uygun varsaymayın; koşulları ayrıca inceleyin.` : 'Mevcut özel ses dosyalarınız korunacak; kendi model/ses lisanslarını inceleyin.')
    if (plannedVoice.managedStt) console.log(`STT modeli: https://huggingface.co/${STT_REPO}`)
    console.log('Paket lisansları ve Whisper/Piper ses koşulları birbirinden farklıdır. Sistem Python’una pip kurulumu yapılmaz.')
    assertVoiceConsentMode(acceptVoiceLicense, !!stdin.isTTY && !!stdout.isTTY)
    if (!acceptVoiceLicense) {
      const prompt = createInterface({ input: stdin, output: stdout })
      try {
        const answer = await prompt.question('Ses ağırlıklarının/lisanslarının kullanımınıza uygunluğunu incelediniz ve ses kurulumunu onaylıyor musunuz? [evet/hayır] ')
        if (!['evet', 'yes'].includes(answer.trim().toLowerCase())) { console.log('İptal edildi; indirme ve ayar değişikliği yapılmadı.'); return }
      } finally { prompt.close() }
    }
  }
  if (voiceOnly) {
    if (!yes) {
      if (!stdin.isTTY || !stdout.isTTY) throw new Error('Kurulum işlemleri için --yes veya etkileşimli onay gerekiyor.')
      const prompt = createInterface({ input: stdin, output: stdout })
      try {
        const answer = await prompt.question('Python ortamı/paket indirmelerini ve ses ayarı yazımını başlatayım mı? [evet/hayır] ')
        if (!['evet', 'yes'].includes(answer.trim().toLowerCase())) return
      } finally { prompt.close() }
    }
    const result = await installVoice(root, originalEnv, plannedVoice!, updateVoice, undefined, console.log)
    if (result.backup) console.log(`Ses ayarı öncesi .env yedeği: ${result.backup}`)
    console.log('Ses kurulumu ve sentetik üretim/transkripsiyon testi tamamlandı. Ayrı terminalde npm run voice:server; ardından npm run dev çalıştırın. Zaten çalışan servisleri yeniden başlatın.')
    return
  }
  let lastEnvText = originalEnv
  for (const role of selectedRole ? [selectedRole] : ['medical', 'companion'] as ModelRole[]) {
    // Snapshot each phase separately: a failed companion/voice install does not
    // roll back a successfully configured medical model or unrelated settings.
    const originalEnv = await optionalFile(join(root, '.env'))
    const changeThisRole = role === (selectedRole ?? 'medical')
    const updateThisRole = update && changeThisRole
    const lockFile = role === 'medical' ? 'model-lock.json' : 'companion-model-lock.json'
    const originalLock = await optionalFile(join(root, 'local-ai', lockFile))
    const lock = originalLock === null ? null : parseLock(originalLock)
    const { config, envText } = configuration(originalEnv ?? await optionalFile(join(root, '.env.example')) ?? '', changeThisRole ? model : undefined, process.env, role)
    if (lock && lock.model !== config.model && !updateThisRole) throw new Error('Seçilen model kilitle uyuşmuyor; bilinçli değişiklik için --update-lock gerekir.')
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
    if (installed) checkLock(lock, installed, updateThisRole)
    console.log(`Rol: ${role} | Model: ${config.model} | Servis: ${config.baseUrl}`)
    console.log(installed ? 'Model zaten mevcut; tekrar indirilmeyecek.' : 'Model eksik: indirme birkaç GB olabilir; kesin boyut artefakta bağlıdır. Yeterli disk alanını kontrol edin.')
    console.log(role === 'medical' ? `HAI-DEF koşulları: ${TERMS_URL}` : `Qwen3 1.7B Ollama kartı ve Apache-2.0 koşulları: ${COMPANION_TERMS_URL}\nÖzel model seçtiyseniz onun kendi koşullarını inceleyin; MedGemma lisansı bu modele uygulanmaz.`)
    if (role === 'medical') console.log('Bu Ollama etiketinin kökenini ayrıca doğrulayın; etiket resmi Google dağıtımının kanıtı değildir.')
    console.log(`İşlem: gerekirse model indirme, sentetik bağlantı testi, .env içinde yalnız ${role === 'medical' ? 'LOCAL_AI' : 'COMPANION_AI'}_* güncellemesi ve model digest kaydı.`)
    console.log('Gemini/API_PORT/DB_FILE ve diğer ayarlar korunur. Güncellenen .env için özel izinli yedek oluşturulur.')
    if (lock && updateThisRole) console.log('Dikkat: mevcut model kilidinin güncellenmesine izin verdiniz.')
    if (!yes) {
      if (!stdin.isTTY || !stdout.isTTY) throw new Error('Etkileşimli onay gerekiyor. Koşulları inceleyip onayladıysanız --yes ile çalıştırın.')
      const prompt = createInterface({ input: stdin, output: stdout })
      try {
        const answer = await prompt.question('Koşulları incelediniz ve bu işlemleri onaylıyor musunuz? [evet/hayır] ')
        if (!['evet', 'yes'].includes(answer.trim().toLowerCase())) { console.log('Bu aşama iptal edildi; önceki başarılı aşamalar korunur.'); return }
      } finally { prompt.close() }
    }
    if (!installed) {
      await pullModel(config, (percent) => console.log(percent === null ? 'İndirme başlatılıyor...' : `İndirme parçası: %${percent}`))
      installed = await installedModel(config)
      if (!installed) throw new Error('İndirme sonrasında model bulunamadı; ayarlar değiştirilmedi.')
    }
    const nextLock = checkLock(lock, installed, updateThisRole)
    console.log('Kısa, tıbbi veri içermeyen üretim testi çalışıyor...')
    const result = await smokeTest(config)
    // Catch a concurrently changed model alias before saving its identity.
    const finalModel = await installedModel(config)
    if (!finalModel) throw new Error('Test sırasında model envanterden kaldırıldı; ayarlar değiştirilmedi.')
    checkLock(nextLock, finalModel, false)
    const backup = await saveSetup(root, originalEnv, envText, originalLock, nextLock, role)
    lastEnvText = envText
    console.log(`Üretim testi başarılı (${(result.elapsedMs / 1000).toFixed(1)} sn). İşlemci: ${result.processor.toUpperCase()}`)
    if (result.processor === 'cpu') console.log('CPU üzerinde hazır; GPU hızlandırması doğrulanmadı. Sürücü/runtime desteğini kontrol edin.')
    if (result.processor === 'unknown') console.log('Üretim çalışıyor, fakat işlemci türü belirlenemedi; ollama ps ile kontrol edin.')
    console.log(`Model digest: ${nextLock.digest}`)
    console.log(`local-ai/${lockFile} oluşturuldu/doğrulandı. Ekipçe aynı modeli kontrol etmek için inceleyip Git’e ekleyin.`)
    if (backup) console.log(`.env yedeği: ${backup}`)
  }
  if (plannedVoice) {
    console.log('Dil modeli hazır; ses kurulumu başlıyor...')
    const current = await optionalFile(join(root, '.env'))
    if (current === null || current !== lastEnvText) throw new Error('Ayarlar değişti; ses kurulumu için yeniden çalıştırın.')
    const result = await installVoice(root, current, voicePlan(root, current), updateVoice, undefined, console.log)
    if (result.backup) console.log(`Ses ayarı öncesi .env yedeği: ${result.backup}`)
    console.log('Ses hazırlandı. Ayrı terminalde npm run voice:server ile ön planda başlatın.')
  }
  console.log('Kurulum tamamlandı. API zaten çalışıyorsa yeniden başlatın: npm run dev')
  console.log('Tamamen yerel kullanım için Ollama’da OLLAMA_NO_CLOUD=1 kullanın; GEMINI_API_KEY ayarınızı araç değiştirmez.')
}

main().catch((error: unknown) => {
  console.error(`Kurulum tamamlanamadı: ${error instanceof Error ? error.message : 'Beklenmeyen hata.'}`)
  process.exitCode = 1
})
