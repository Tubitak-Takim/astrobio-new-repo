// A shared English shell keeps navigation and accessibility labels consistent.
(() => {
  const icon = name => `<iconify-icon icon="${name}" aria-hidden="true"></iconify-icon>`;
  const link = (file,route,name,symbol) => `<a href="${file}.html" class="nav-link" data-route="${route}">${icon(symbol)}<span>${name}</span></a>`;
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="topbar">
      <a href="index.html" class="brand" aria-label="ASTROBIO main panel"><span class="brand-emblem">${icon('mdi:orbit')}</span><span><strong>ASTROBIO</strong><small>Autonomous Astronaut Health Monitoring Platform</small></span></a>
      <div class="top-right"><div class="top-meta"><span class="live-dot"></span> SIMULATION SYSTEM <span class="top-date" id="top-clock"></span></div><div class="safety-note">${icon('mdi:alert-outline')}<span>Prototype · Not a medical device · Does not diagnose</span></div></div>
    </header>
    <div class="shell"><aside class="sidebar" aria-label="Main navigation">
      <div class="sidebar-caption">MISSION MANAGEMENT</div><nav class="nav" id="main-nav">
        ${link('index','overview','Main Panel','ci:main-component')}
        ${link('ask-to-ai','ai','Ask to AI','arcticons:ai-chat')}
        ${link('personel-info','personal','Personnel Info','mdi:account-outline')}
        ${link('health-check','health','Interactive Health Check','arcticons:laos-health')}
        <div class="nav-divider" aria-hidden="true"></div><span class="nav-group-label">DAILY INDICATORS</span>
        ${link('uyku','sleep','Sleep Analysis','mdi:weather-night')}
        ${link('toparlanma','recovery','Recovery','mdi:heart-pulse')}
        ${link('gunluk-yuk','load','Daily Load','mdi:lightning-bolt-outline')}
        ${link('gorev-sagligi','mission-health','Mission Health','mdi:orbit')}
        ${link('gunluk-etkiler','insights','Daily Insights','mdi:chart-box-outline')}
        <div class="nav-divider" aria-hidden="true"></div><span class="nav-group-label">SCIENTIFIC ANALYSIS</span>
        ${link('crew-data','crew-data','Crew Data','mdi:account-group-outline')}
        ${link('live-monitoring','live','Live Monitoring','mdi:access-point')}
        ${link('olcumler','measurements','Measurements','mdi:chart-line')}
        ${link('bis-analizi','bis','BIS Analysis','mdi:waveform')}
        ${link('ridge','ridge','RIDGE','mdi:shield-outline')}
        ${link('raporlar','reports','Reports','carbon:report')}
        ${link('takvim','calendar','Calendar','akar-icons:calendar')}
      </nav><div class="sidebar-bottom"><div class="sidebar-planet" id="sidebar-planet"><div class="planet-label"><small>MISSION LOCATION</small><b id="planet-title">MARS</b><span id="planet-sub">Autonomous exploration mission</span></div><div class="planet-art"><span class="planet-fallback mars" id="planet-fallback"></span><img id="planet-img" alt="Selected mission location" loading="lazy"></div></div><div class="sidebar-foot"><span class="live-dot"></span> Interface online <span class="demo-pill">DEMO</span></div></div>
    </aside><main id="main" class="content" tabindex="-1"><div class="loading-view">Loading ASTROBIO…</div></main></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`);
})();
